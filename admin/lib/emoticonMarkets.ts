/**
 * 이모티콘 마켓 스펙. 매수·사이즈·가이드라인 정의.
 * 출처:
 *  - 카카오: emoticonstudio.kakao.com
 *  - 네이버 OGQ: ogq.me/creator
 *  - 라인: creator.line.me
 */

export type MarketId = "kakao" | "ogq" | "line";

export interface MarketSpec {
  id: MarketId;
  label: string;
  /** 스티커(정지) 매수 */
  staticCount: number;
  /** 1장 출력 사이즈 (정사각 또는 가로×세로) */
  outputSize: { width: number; height: number };
  /** 마켓이 요구하는 파일 포맷 */
  format: "png_transparent";
  /** 심사 키워드 (프롬프트에 주입할 가이드) */
  guideline: string;
  /** 심사 난이도 한 줄 */
  difficulty: string;
  /** 추가 안내 */
  hint?: string;
}

export const MARKETS: Record<MarketId, MarketSpec> = {
  ogq: {
    id: "ogq",
    label: "네이버 OGQ 마켓",
    staticCount: 24,
    outputSize: { width: 740, height: 640 },
    format: "png_transparent",
    guideline:
      "캐릭터가 화면 중앙에 크게. 가로 740 × 세로 640 비율로 잘리지 않게. 텍스트/말풍선은 캐릭터 옆 또는 위에. 한글 1~3 단어 위주.",
    difficulty: "보통 — 한국 시장, 블로그 컨텍스트와 가장 잘 맞음",
    hint: "네이버 블로그·카페에 바로 쓸 수 있어서 본인 블로그 컨셉과 시너지가 큼.",
  },
  kakao: {
    id: "kakao",
    label: "카카오 이모티콘 스튜디오",
    staticCount: 32,
    outputSize: { width: 360, height: 360 },
    format: "png_transparent",
    guideline:
      "정사각 360×360. 캐릭터가 사각형 안에 꽉 차게. 외곽선 굵게(2~3px 권장). 채팅창 작은 사이즈에서도 표정/상황이 즉시 읽혀야 함.",
    difficulty: "매우 어려움 — 통과율 1~2% 수준. 캐릭터 IP·상품성 심사 까다로움",
  },
  line: {
    id: "line",
    label: "라인 크리에이터스 마켓",
    staticCount: 40,
    outputSize: { width: 370, height: 320 },
    format: "png_transparent",
    guideline:
      "가로 370 × 세로 320. 일본/태국/대만 사용자 비중 큼 → 한국어 텍스트는 최소화 또는 영어 병기 권장.",
    difficulty: "보통 — 글로벌, 한국 외 사용자 비중 60% 이상",
  },
};

export function isValidMarket(v: unknown): v is MarketId {
  return v === "kakao" || v === "ogq" || v === "line";
}
