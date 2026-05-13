import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { REPO_ROOT } from "@/lib/paths";
import { MARKETS, isValidMarket } from "@/lib/emoticonMarkets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  market: string;
  concept: string;
  /** 이미 사용자가 고정해놓은 표현이 있으면 유지하고 부족분만 채우기 */
  keep?: string[];
}

function buildPrompt(market: keyof typeof MARKETS, concept: string, keep: string[]): string {
  const spec = MARKETS[market];
  return [
    "너는 한국 이모티콘 마켓에 등록할 캐릭터 이모티콘의 표현/감정 리스트를 짜는 기획자야.",
    "",
    `[마켓] ${spec.label}`,
    `[필요 매수] ${spec.staticCount}개 (정지 스티커)`,
    `[마켓 가이드] ${spec.guideline}`,
    "",
    `[캐릭터 컨셉]`,
    "```",
    concept,
    "```",
    "",
    keep.length > 0
      ? `[유지할 표현 — 이미 사용자가 확정함, 이 항목은 그대로 포함시켜라]\n${keep.map((k, i) => `${i + 1}. ${k}`).join("\n")}\n`
      : "",
    "[작업]",
    `이 캐릭터로 만들 정지 스티커 ${spec.staticCount}개의 표현/상황 리스트를 짜라.`,
    "",
    "[리스트 구성 원칙]",
    "- 일상 사용 빈도 높은 것 위주 (인사·감사·OK·미안·축하·화남·당황·체념·웃음·울음·졸림 등)",
    "- 한국어 채팅 맥락 우선 (특히 카카오/OGQ). 라인은 글로벌 통용 표현 비중을 좀 더.",
    "- 비슷한 감정 중복 최소화. 예: '기쁨' '신남' 둘 다 X, 하나로.",
    "- 텍스트 라벨은 1~3 단어 한국어 (예: '안녕', '고마워', '진짜?', '월요일')",
    "- prompt 필드는 이미지 생성 모델에게 줄 1줄 영문 설명 (캐릭터 포즈/표정/배경 요소). 캐릭터 외모는 적지 말 것 — 그건 reference 이미지가 담당.",
    "",
    "[출력 형식 — 반드시 아래 JSON 한 덩어리만, 앞뒤 설명 금지]",
    "{",
    `  "expressions": [`,
    `    { "index": 1, "label": "안녕", "prompt": "waving one hand with a bright smile, looking at the viewer" },`,
    `    { "index": 2, "label": "고마워", "prompt": "hands clasped together, slight bow, grateful expression" },`,
    `    ... (정확히 ${spec.staticCount}개)`,
    `  ]`,
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
    throw new Error("응답에서 JSON 블록을 찾지 못함.\n원본:\n" + stdout.slice(0, 2000));
  }
  return JSON.parse(trimmed.slice(first, last + 1));
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isValidMarket(body.market)) {
    return NextResponse.json({ ok: false, error: "invalid_market" }, { status: 400 });
  }
  if (!body.concept || body.concept.trim().length < 5) {
    return NextResponse.json(
      { ok: false, error: "concept_too_short", message: "캐릭터 컨셉을 5자 이상 입력하세요." },
      { status: 400 }
    );
  }

  const prompt = buildPrompt(body.market, body.concept.trim(), Array.isArray(body.keep) ? body.keep : []);

  return new Promise<Response>((resolve) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--model", "claude-sonnet-4-6"],
      { cwd: REPO_ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] }
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("error", (e) =>
      resolve(NextResponse.json({ ok: false, error: "spawn_error", message: e.message }, { status: 500 }))
    );
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
        const parsed = extractJson(stdout) as { expressions: unknown };
        const arr = Array.isArray(parsed.expressions) ? parsed.expressions : [];
        resolve(NextResponse.json({ ok: true, expressions: arr }));
      } catch (e) {
        resolve(
          NextResponse.json(
            {
              ok: false,
              error: "parse_failed",
              message: (e as Error).message,
              raw_stdout: stdout.slice(0, 6000),
            },
            { status: 500 }
          )
        );
      }
    });
  });
}
