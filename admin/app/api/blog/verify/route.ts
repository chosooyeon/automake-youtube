import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { REPO_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface VerifyBody {
  title?: string;
  content: string;
}

function buildPrompt(body: VerifyBody): string {
  return [
    "너는 한국어 블로그 글의 사실 검증 어시스턴트야.",
    "사용자가 작성한 블로그 본문에서 검증 가능한 '사실 주장' 을 뽑고,",
    "각 주장마다 WebSearch 도구를 호출해서 실제로 맞는지 확인한다.",
    "",
    "[검증 대상 종류]",
    "- 제도/정책 (예: 청년형 ISA 2026년 6월 출시, 부모급여 금액, 비과세 한도)",
    "- 가격/금액 (예: 1,500만원 비과세, 자녀 증여 2,000만원 한도)",
    "- 날짜/일정 (예: 스페이스X 6월 상장, 라비니움 그랜드오픈 시점)",
    "- 장소/주소 (예: 라비니움 송파/잠실 위치)",
    "- 브랜드/상품명 사실 (예: 1층 리츄얼홀, 4층 블룸홀)",
    "",
    "[검증 제외]",
    "- 개인 감정/감상 (예: '맘에 들었다', '신기했다')",
    "- 본인 경험담 자체 (예: '여기서 결혼식 했다')",
    "- 단순 의견 (예: '추천한다')",
    "",
    body.title ? `[제목]\n${body.title}\n` : "",
    "[본문]",
    "```",
    body.content,
    "```",
    "",
    "[작업 순서]",
    "1. 본문에서 검증 가능한 사실 주장을 최대 8개까지 뽑는다 (중요도 순).",
    "2. 각 주장마다 WebSearch 도구로 1~2회 검색해 실제 맞는지 확인한다.",
    "3. 각 주장의 상태를 정한다: 'ok' (확인됨) / 'warn' (부분적/부정확) / 'unknown' (출처 못 찾음) / 'bad' (틀림).",
    "4. 결과를 아래 JSON 한 덩어리로만 출력. 앞뒤 설명·코드펜스 금지.",
    "",
    "[출력 JSON 형식]",
    "{",
    '  "items": [',
    "    {",
    '      "claim": "본문 원문에서 뽑은 사실 주장 (가능하면 원문 그대로)",',
    '      "status": "ok" | "warn" | "unknown" | "bad",',
    '      "note": "검증 결과 한 줄 설명 (왜 그런 status 인지)",',
    '      "correction": "틀리거나 부정확한 경우 권장 수정 문구. 아니면 빈 문자열",',
    '      "sources": ["출처 URL 1", "출처 URL 2"]',
    "    }",
    "  ],",
    '  "summary": "전체 검증 요약 1~2줄 (예: 8개 중 6개 OK, 2개 부정확)"',
    "}",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

function extractJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("응답에서 JSON 블록을 찾지 못했습니다.\n원본:\n" + stdout.slice(0, 2000));
  }
  const candidate = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new Error(
      "JSON 파싱 실패: " + (e as Error).message + "\n후보:\n" + candidate.slice(0, 2000)
    );
  }
}

export async function POST(req: Request) {
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }
  if (!body?.content || body.content.trim().length < 50) {
    return NextResponse.json(
      { ok: false, error: "content_too_short", message: "본문이 너무 짧습니다." },
      { status: 400 }
    );
  }

  const prompt = buildPrompt(body);

  // sonnet + WebSearch 허용. claude headless 는 기본적으로 WebSearch 사용 가능.
  // 검증 과정에서 여러 번 검색하므로 turn 여유 있게.
  const args = [
    "-p",
    prompt,
    "--model",
    "claude-sonnet-4-6",
    "--allowed-tools",
    "WebSearch",
    "--max-turns",
    "20",
  ];

  return new Promise<Response>((resolve) => {
    const child = spawn("claude", args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("error", (e) => {
      resolve(
        NextResponse.json(
          { ok: false, error: "spawn_error", message: e.message },
          { status: 500 }
        )
      );
    });
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { ok: false, error: "claude_exit_nonzero", code, stderr: stderr.slice(0, 4000) },
            { status: 500 }
          )
        );
        return;
      }
      try {
        const parsed = extractJson(stdout);
        resolve(NextResponse.json({ ok: true, result: parsed }));
      } catch (e) {
        resolve(
          NextResponse.json(
            {
              ok: false,
              error: "parse_failed",
              message: (e as Error).message,
              raw_stdout: stdout.slice(0, 8000),
            },
            { status: 500 }
          )
        );
      }
    });
  });
}
