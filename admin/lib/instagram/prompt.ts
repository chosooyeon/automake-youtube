import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/paths";
import { type CategoryDef, type CategoryId } from "./categories";

const STYLE_FILE = path.join(REPO_ROOT, "admin", "data", "instagram_style.md");

function loadStyle(): string | null {
  try {
    return fs.readFileSync(STYLE_FILE, "utf8");
  } catch {
    return null;
  }
}

export interface GenerateBody {
  category: CategoryId;
  region?: string;
  content: string;
  cardCount: number;
  extraNote?: string;
  /** 뉴스 수집 패널에서 골라 넣은 기사 원문 링크 (검증 시작점) */
  sourceLinks?: string[];
}

export function buildPrompt(body: GenerateBody, cat: CategoryDef): string {
  const region = (body.region || "").trim();
  const userContent = body.content.trim();
  const extra = (body.extraNote || "").trim();
  const styleDoc = loadStyle();
  const yearLabel = new Date().getFullYear() + "년 기준";
  const links = (body.sourceLinks ?? []).filter((s) => /^https?:\/\//.test(s));

  return [
    cat.domainIntro,
    "사용자가 준 메모/주제를 바탕으로 5~10장짜리 카드뉴스 1세트를 만든다.",
    "",
    "[카테고리]",
    `- ID: ${cat.id}`,
    `- 분류: ${cat.label}`,
    `- 톤 가이드: ${cat.toneGuide}`,
    `- 우선 출처: ${cat.preferredSources.join(", ")}`,
    "",
    "[채널 스타일 가이드]",
    styleDoc ?? "(스타일 가이드 파일 없음 — 기본 톤 사용)",
    "",
    region ? `[지역] ${region} 지자체 정보가 있으면 우선 포함시킬 것.` : "",
    "",
    "[사용자 입력 — 이걸 기반으로]",
    "```",
    userContent,
    "```",
    links.length > 0
      ? [
          "[원문 링크 — 뉴스 수집 패널에서 선택된 기사]",
          ...links.map((u) => `- ${u}`),
          "이 링크들의 내용을 WebSearch 로 먼저 확인하고, 거기서 확인된 사실만 카드에 쓴다.",
          "제목만 보고 내용을 추측해서 쓰지 말 것.",
        ].join("\n")
      : "",
    extra ? `[추가 요청] ${extra}` : "",
    `[카드 수] 총 ${body.cardCount}장 (cover 1 + body N-2 + cta 1, 필요시 사이에 comparison/stat 끼움)`,
    "",
    "[작업 순서 — 반드시 이 순서대로]",
    "1) 사용자 입력에서 '검증 가능한 사실 주장' (금액·수치·자격·기간·주체·날짜) 을 추려낸다.",
    `2) WebSearch 도구로 각 주장의 출처를 확인한다. ${cat.verifyRule}`,
    "3) 카드 본문에 들어갈 사실은 ok 인 것만. 출처 못 찾으면 카드에서 빼고 '~로 알려져 있음' 같은 추정 표현 절대 금지.",
    `4) 카드별로 출처 URL ≥ 2개 (cover/cta 제외). 미달 시 그 카드 자체를 만들지 말 것. 최종 카드 수가 ${body.cardCount} 미만으로 줄어들어도 OK — 차라리 적게 만들고 정확하게.`,
    `5) 각 카드 footer_source_label 자동 생성: 예) "${cat.defaultSourceLabel} (${yearLabel})"`,
    "6) 각 카드 background_prompt 생성. 텍스트 없는 추상 배경 전용. 다음 스타일을 반드시 포함:",
    `   "${cat.backgroundStyle}". 카드별로 약간씩 변주(컬러 위치, 형태) — 5장이 똑같이 안 보이게.`,
    "",
    "[레이아웃 사용 가이드]",
    "- cover (1장째): fields = { kicker, headline, subhead }. headline 은 2줄 이내, 큰 핵심 메시지. 숫자 강조 OK.",
    "- body (본문 카드): fields = { headline, bullets[3-5] }. bullets 각 줄 한국어 28자 이내.",
    "- comparison (선택, 2그룹 비교 시): fields = { headline, left_title, left_items[], right_title, right_items[] }",
    "- stat (선택, 큰 숫자 1개 강조 시): fields = { kicker, number, unit, caption }. number 는 5자 이내 (예: '200만', '+15%').",
    "- cta (마지막 장): fields = { headline, body, account_handle }. headline 은 '저장해두고 신청할 때' 식. account_handle 은 '@엄마지갑' 같이.",
    "",
    "[출력 형식]",
    "최종 응답은 반드시 아래 JSON 한 덩어리만 출력 (앞뒤 설명·코드펜스 금지):",
    "{",
    `  "category": "${cat.id}",`,
    region ? `  "region": "${region}",` : "",
    '  "topic": "…",                       // 한 줄 주제 요약 (slug 만들 때 참고)',
    '  "cards": [',
    "    {",
    '      "layout": "cover" | "body" | "comparison" | "stat" | "cta",',
    '      "fields": { …레이아웃별 필드 객체… },',
    '      "sources": ["https://…go.kr/…", "https://…"],   // ≥2 권장, cover/cta 는 0~1 OK',
    `      "background_prompt": "${cat.backgroundStyle}, …약간의 변주…",`,
    `      "footer_source_label": "${cat.defaultSourceLabel} (${yearLabel})"   // cover/cta 는 빈 문자열 OK`,
    "    }",
    "  ],",
    '  "caption": "…",                     // 인스타 포스트 본문 (해시태그 제외, 4~6줄)',
    '  "hashtags": ["#…", "#…", …],          // 8~15개, 광고성·자극적 제외',
    '  "verify_summary": "…",              // "5장 모두 공식 출처 2+개 확인" 식 1줄',
    '  "verify_items": [',
    "    {",
    '      "claim": "…",                    // 검증한 사실',
    '      "status": "ok" | "warn" | "unknown" | "bad",',
    '      "note": "…",',
    '      "sources": ["https://…"]',
    "    }",
    "  ]",
    "}",
  ]
    .filter((s) => s !== "")
    .join("\n");
}
