import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STYLE_FILE = path.join(REPO_ROOT, "admin", "data", "blog_style.md");

function loadStyleSignature(): string | null {
  try {
    return fs.readFileSync(STYLE_FILE, "utf8");
  } catch {
    return null;
  }
}

type Category =
  | "gov_support"
  | "baby_review"
  | "newlywed_diary"
  | "food_cafe"
  | "wedding_prep";

const CATEGORY_GUIDE: Record<Category, { label: string; intent: string; hooks: string[] }> = {
  gov_support: {
    label: "정부지원금 & 꿀팁",
    intent: "정보성. C-Rank/검색유입 핵심. 신청방법·지급일·자격조건을 정확히 정리.",
    hooks: [
      "제목에 [지역명 + 연도(2026) + 신청방법] 패턴을 우선 사용",
      "본문은 신청자격 → 지원금액 → 신청방법(온라인/방문) → 지급일정 → 주의사항 순서",
      "표 1개로 신청자격/금액/기한 요약",
      "FAQ 3~5개 (실제 검색어 기반: '소급 적용 되나요', '계좌 변경', '지급일')",
    ],
  },
  baby_review: {
    label: "내돈내산 육아템 리뷰",
    intent: "수익화 연결. 진짜 후기 톤 + 비교/장단점 명확.",
    hooks: [
      "제목 패턴: 'X개월 아기 OOO 솔직 후기' / 'OOO vs OOO 비교' / '괜히 산 템 vs 잘 산 템'",
      "본문은 구매계기 → 사용기간 → 장점 3개 → 단점 2개 → 추천대상 → 가성비 평가",
      "사진 자리에 '실사용 컷', '구성품 컷', '비교 컷' 명시",
      "마지막에 '비슷한 가격대 대안' 1~2개 언급",
    ],
  },
  newlywed_diary: {
    label: "신혼/일상 기록",
    intent: "체류시간 + 이웃 소통. 감성 + 솔직 + 일상 톤.",
    hooks: [
      "제목 패턴: '결혼 X개월차 솔직한 OOO' / '신혼집 OOO 후기'",
      "본문은 시점/배경 → 그날의 감정 → 구체적 에피소드 → 배운 점/팁",
      "이웃과 공감대 만들 수 있는 질문 1개를 마지막에",
    ],
  },
  food_cafe: {
    label: "맛집 & 카페 투어",
    intent: "유입량 확보. 지역 키워드 강력. 사진/메뉴/가격 디테일.",
    hooks: [
      "제목 패턴: '[지역명] OOO 맛집 / 카페 (내돈내산)' / '[지역명] 아이랑 가기 좋은 OOO'",
      "본문은 위치/주차 → 분위기 → 주문메뉴 + 가격 → 맛 평가 → 재방문 의사 → 영업정보(영업시간/휴무일)",
      "지도 위치 + 주소 끝에 별도 줄로 명시",
    ],
  },
  wedding_prep: {
    label: "결혼 준비 (웨딩홀/청첩장/가전)",
    intent: "단가 높은 광고주 키워드. 비교/견적 정보 위주.",
    hooks: [
      "제목 패턴: '[지역명] 상견례 장소 TOP3' / '신혼가전 졸업 견적 공유' / '비동행 플래너 후기'",
      "본문은 비교 항목 명확히 → 가격대별 정리 → 솔직 후기 → 체크리스트",
      "가격은 '2026년 X월 기준' 명시",
    ],
  },
};

interface GenerateBody {
  category: Category;
  region?: string;
  content: string;
  extraNote?: string;
  useStyle?: boolean;
}

function buildPrompt(body: GenerateBody): string {
  const guide = CATEGORY_GUIDE[body.category];
  const region = (body.region || "").trim();
  const userContent = body.content.trim();
  const extra = (body.extraNote || "").trim();
  const styleDoc = body.useStyle ? loadStyleSignature() : null;

  const toneBlock = styleDoc
    ? [
        "[작성자 스타일 — 반드시 이 톤으로 작성]",
        "아래는 본인이 실제 쓴 글 4편에서 추출한 본인의 글쓰기 시그니처다.",
        "이 톤·말버릇·문장 형태를 그대로 살려서 작성해야 한다. 일반적인 블로그 톤으로 평탄화하지 말 것.",
        "",
        styleDoc,
        "",
      ]
    : [
        "[채널 톤]",
        "- 채널 컨셉: '찐또의 스마트 육아/결혼' (육아·결혼·정부지원금 정보를 솔직 톤으로)",
        "- 1인칭 (~했어요, ~봤어요), 과한 이모지 금지, 광고 톤 금지",
        "- 개발자가 README 쓰듯 소제목/리스트로 구조화",
        "",
      ];

  return [
    "너는 네이버 블로그 SEO에 능숙한 한국어 글쓰기 어시스턴트야.",
    "사용자가 직접 겪은 경험/메모를 바탕으로 네이버 블로그 1편을 초안 작성한다.",
    "",
    ...toneBlock,
    "[이번 편 카테고리]",
    `- 분류: ${guide.label}`,
    `- 의도: ${guide.intent}`,
    "- 작성 가이드:",
    ...guide.hooks.map((h) => `  - ${h}`),
    "",
    region ? `[지역 키워드] '${region}' 를 제목과 본문 도입부에 자연스럽게 포함시킬 것 (네이버 [지역명+정보] 패턴).` : "",
    "",
    "[사용자 입력 — 이걸 기반으로 글을 만들어]",
    "```",
    userContent,
    "```",
    "위 입력에 '[노리는 검색 키워드]' 블록이 있으면 그건 사실 검증 대상이 아니라 SEO 타깃이다.",
    "제목 3개와 본문 도입부·소제목에 그 키워드들을 자연스럽게 배치하되, 억지로 반복해 키워드 스터핑하지 말 것.",
    "'[참고 기사]' 블록이 있으면 링크 내용을 WebSearch 로 확인한 뒤 사실 근거로만 쓰고, 기사 문장을 그대로 베끼지 말 것.",
    extra ? `[추가 요청] ${extra}` : "",
    "",
    "[작업 순서 — 반드시 이 순서대로]",
    "1) 사용자 입력에서 '검증 가능한 사실 주장' 을 최대 8개까지 추려낸다 (제도/정책, 가격/금액, 날짜/일정, 장소/주소, 브랜드명·홀명 같은 것). 개인 감상·후기·감정은 검증 대상 아님.",
    "2) 각 주장마다 WebSearch 도구를 1~2회 호출해 실제로 맞는지 확인한다. 한국 정책·가격은 한국어 검색어로.",
    "3) 검증 결과로 status 를 'ok' / 'warn' (부분적·부정확) / 'unknown' (출처 못 찾음) / 'bad' (틀림) 중 하나 부여.",
    "4) 본문을 작성할 때는 ok 인 사실만 그대로 쓴다. warn/bad 는 검색으로 확인된 정정값으로 바꿔서 쓴다. unknown 인 사용자 입력 사실은 본문에서 단정짓지 말고 '<여기에 X 적어주세요>' placeholder 처리.",
    "5) 사용자가 아예 안 적은 사실은 절대 지어내지 말 것 (가격/날짜/주소).",
    "",
    "[본문 작성 필수 제약]",
    "- 본문 글자 수: 공백 제외 1,000자 이상 (실제 셀 수 있어야 함). 1,500자 정도가 이상적.",
    "- 사진 자리 표시: 본문 중간에 정확히 4곳 `[사진N: <어떤 사진을 넣어야 할지 한 줄 설명>]` 형식. N은 1~4.",
    "- 본문 마지막에 해시태그 8~12개.",
    styleDoc
      ? "- 본문은 마크다운 헤더(##)와 표(|) 는 최소화하고, 본인 시그니처대로 '한 줄에 한 문장' + 빈 줄로 끊는 네이버 블로그 톤을 우선. 단 SEO를 위해 도입부 1~2줄과 마무리 1줄에는 핵심 키워드를 자연스럽게 포함."
      : "- 마크다운 사용: ## 소제목, **강조**, - 리스트, | 표 | 가능. 단 네이버 블로그 호환을 위해 코드블록은 쓰지 말 것.",
    "",
    "[출력 형식]",
    "최종 응답은 반드시 아래 JSON 한 덩어리만 출력 (앞뒤 설명·코드펜스 금지):",
    "{",
    '  "titles": ["…", "…", "…"],   // 제목 후보 정확히 3개. 첫 번째는 SEO 최적(지역+정보+숫자), 두 번째는 클릭 유도(감정/궁금증), 세 번째는 롱테일(구체적 상황)',
    '  "category_label": "…",        // 네이버 블로그 카테고리 추천',
    '  "content_markdown": "…",      // 본문 (검증된 사실 + 사진 자리 포함, 1,000자+ 공백제외)',
    '  "photo_spots": [               // 4개. content_markdown 안의 [사진N:…] 와 1:1 매칭',
    '    { "index": 1, "description": "…" },',
    '    { "index": 2, "description": "…" },',
    '    { "index": 3, "description": "…" },',
    '    { "index": 4, "description": "…" }',
    '  ],',
    '  "hashtags": ["#…", "#…", "…"],',
    '  "char_count_excl_space": 1234,',
    '  "verify_summary": "…",        // 1~2줄. 예: "8개 중 6 OK, 2 정정"',
    '  "verify_items": [              // 위 1~3단계에서 만든 검증 리스트. 본문에서 어떤 사실을 어떻게 처리했는지 1:1',
    '    {',
    '      "claim": "사용자가 입력했던 원문 주장 또는 본문에서 다룬 사실",',
    '      "status": "ok" | "warn" | "unknown" | "bad",',
    '      "note": "검증 결과 1줄 설명",',
    '      "correction": "정정이 필요했다면 본문에 실제로 반영한 정정값, 아니면 빈 문자열",',
    '      "sources": ["출처 URL 1", "출처 URL 2"]',
    '    }',
    '  ]',
    "}",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

function extractJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  // 우선 첫 { ~ 마지막 } 블록을 잘라서 시도
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
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }

  if (!body || !body.category || !CATEGORY_GUIDE[body.category]) {
    return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
  }
  if (!body.content || body.content.trim().length < 10) {
    return NextResponse.json(
      { ok: false, error: "content_too_short", message: "내용을 10자 이상 입력해주세요." },
      { status: 400 }
    );
  }

  const prompt = buildPrompt(body);

  // sonnet + WebSearch: 사실 검증 후 본문 작성 (한 호출 안에서)
  const args = [
    "-p",
    prompt,
    "--model",
    "claude-sonnet-4-6",
    "--allowed-tools",
    "WebSearch",
    "--max-turns",
    "25",
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
