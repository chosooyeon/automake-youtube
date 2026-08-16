/**
 * 주식 탭 컴포넌트들이 공유하는 타입.
 *
 * 서버 응답 모양을 한 군데에만 적어 둔다 — 스캔 화면과 방법론 화면이 각자 같은
 * 인터페이스를 다시 선언하면, API 가 바뀌었을 때 한쪽만 고쳐도 타입 검사가 통과한다.
 */

export type Market = "KR" | "US";

/** 화면 상단 시장 필터. ALL 은 스캔에서만 의미가 있다 (백테스트는 통화가 달라 섞을 수 없다) */
export type MarketFilter = Market | "ALL";

export const MARKET_FLAG: Record<Market, string> = { KR: "🇰🇷", US: "🇺🇸" };
export const MARKET_SHORT: Record<Market, string> = { KR: "국내", US: "미국" };

/* ── /api/stock/method ─────────────────────────────────── */

export interface WalkForward {
  ranAt: string | null;
  split: string | null;
  winner: string | null;
  trades: number | null;
  expectancyR: number | null;
  /** true=유지됨 · false=무너짐 · null=판정 불가 */
  held: boolean | null;
}

export interface MarketMethod {
  market: Market;
  label: string | null;
  note: string | null;
  /** null 이면 워크포워드 통과 전 — 즉 아직 가설이다 */
  verifiedAt: string | null;
  summary: string;
  warnings: string[];
  walkForward: WalkForward | null;
  sweepCommand: string;
  walkForwardCommand: string;
}

export interface RuleRow {
  section: "entry" | "exit" | "risk" | "costs";
  key: string;
  label: string;
  hint: string;
  values: Record<Market, string>;
  differs: boolean;
}

export interface MethodPayload {
  capital: number;
  warmupBars: number;
  markets: MarketMethod[];
  rows: RuleRow[];
}
