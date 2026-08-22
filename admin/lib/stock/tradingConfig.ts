/**
 * 자동매매 정책 설정 (config/stock-trading.json).
 *
 * 이 파일에 담긴 숫자가 곧 전략이다. 신호 엔진(signals.ts)은 "언제 볼까"만 알려주고,
 * "얼마를 걸고 언제 자를까"는 전부 여기서 나온다 — 수익률은 정하는 값이 아니라
 * 이 설정에서 계산되어 나오는 결과값이다.
 *
 * 백테스트(backtest.ts)와 실매매(추후 broker/*)가 **같은 설정을 읽는다**.
 * 백테스트에서 검증한 규칙과 실제로 나가는 주문이 갈라지면 검증이 무의미해지기 때문.
 *
 * ── 왜 시장별로 나뉘어 있나 ─────────────────────────────────────
 * 국내 설정을 그대로 미국에 들고 갔더니 PF 0.88 / -13.1% 로 **돈을 잃었다**
 * (docs/STOCK-TRADING.md 8-4). 변동성·비용·추세 지속성이 다른 시장을 한 설정으로
 * 굴리는 것 자체가 틀린 전제였다. 그래서 파일은 2층이다:
 *
 *   공통 기본값 (capital·warmupBars·entry·exit·risk·costs)
 *     └ markets.KR / markets.US 가 자기 시장 몫만 덮어쓴다
 *
 * `loadTradingConfig("US")` 는 공통값 위에 US 층을 얹어서 돌려준다.
 * 인자를 안 주면 공통값만 — 시장이 정해지지 않은 자리에서 US 규칙이 새는 걸 막는다.
 *
 * ★ 시장 규칙의 `verifiedAt` 이 null 이면 **아직 가설**이다.
 *   스윕 표에서 제일 좋은 줄을 골라 여기 적는 건 과최적화다 (같은 문서 8-5:
 *   학습구간 1위가 검증구간 꼴찌가 됐다). 워크포워드를 통과한 날만 적는다.
 */

import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../paths";
import type { Market } from "./naver";

export const TRADING_CONFIG_FILE = path.join(CONFIG_DIR, "stock-trading.json");

/** 화면·CLI 가 도는 순서. 국내가 먼저다 (검증이 더 진행된 쪽) */
export const MARKETS: Market[] = ["KR", "US"];

export const MARKET_FLAG: Record<Market, string> = { KR: "🇰🇷", US: "🇺🇸" };

export interface EntryRule {
  /** 이 순점수(buyScore - sellScore) 이상일 때만 진입. signals.ts 기준 4 = STRONG_BUY */
  minNetScore: number;
  /** 60일선 위 + 60일선 상승(uptrend_filter)일 때만 진입 — 하락장 물타기 방지 */
  requireUptrend: boolean;
  /** 동시에 들고 갈 수 있는 최대 종목 수 */
  maxOpenPositions: number;
  /**
   * 같은 업종에 동시에 담을 수 있는 최대 종목 수. null 이면 제한 없음(기본값).
   *
   * ⚠ **이건 수익용 손잡이가 아니라 보험이다. 값에 따라 부호가 바뀐다.**
   *   1 로 조이면 상승장에서 **후보 중 최악**이다 (PF 0.98 · +0.006R · MDD -25.0%,
   *     제한없음 1.29 · +0.108R · -16.8%). 좋은 자리를 막고 점수 낮은 다른 업종을 대신 산다.
   *   2 는 상승장에서 거의 안 걸려 손해가 -0.007R 수준이고, **하락 3구간 모두에서**
   *     단순보유 대비 우위가 제한없음보다 컸다 (-8.8% 장: +4.2%p vs +2.4%p).
   *
   * 즉 분산은 **좋은 장에서 조금 내고 나쁜 장에서 돌려받는 비용**이다. 그래서
   * 공통 기본값은 null(끔)로 두고 **markets.KR 에서만 2로 켠다** — 국내에서만 검증했기 때문.
   * 값을 바꾸려면 walk-forward.ts 의 ind1/ind2/indoff 후보로 먼저 돌려볼 것.
   *
   * 업종을 못 받은 종목(비공식 API 실패)은 제약 대상에서 빠진다.
   */
  maxPerIndustry: number | null;
  /** 같은 종목을 청산 후 며칠간 재진입 금지 (신호가 며칠 연속 뜰 때 중복 진입 방지) */
  cooldownDays: number;
}

export interface ExitRule {
  /** 손절 = 진입가 − ATR × 이 배수. 이 폭이 1R 이 된다 */
  stopLossAtrMult: number;
  /** 익절 = 진입가 + ATR × 이 배수. stopLossAtrMult 의 2배면 RR 2:1 */
  takeProfitAtrMult: number;
  /** 트레일링 스톱: 종가 − ATR × 배수로 손절선을 위로만 끌어올린다. null 이면 미사용 */
  trailingAtrMult: number | null;
  /** 이 영업일수를 넘기면 손익과 무관하게 정리 (자금이 죽은 종목에 묶이는 것 방지) */
  maxHoldDays: number;
  /** SELL / STRONG_SELL 판정이 나오면 청산 */
  exitOnSellVerdict: boolean;
}

export interface RiskRule {
  /** 1회 매매에서 잃을 각오를 하는 금액 = 총자산 × 이 % (손절까지 갔을 때의 손실) */
  riskPerTradePct: number;
  /** 한 종목에 넣을 수 있는 최대 비중 (총자산 대비 %) */
  maxPositionPct: number;
  /** 하루 손실이 이 %를 넘으면 그날 신규 진입 중단 (킬스위치) */
  dailyLossLimitPct: number;
}

export interface CostRule {
  /** 매매 수수료 (bp = 0.01%). 1.5 = 0.015% */
  commissionBps: number;
  /** 슬리피지: 호가에 밀려 불리하게 체결되는 정도. 왕복으로 각각 적용된다 */
  slippageBps: number;
  /** 매도 시에만 붙는 세금 (bp). 국내 0.15% = 15bp, 미국 주식은 사실상 0 */
  sellTaxBps: { KR: number; US: number };
}

export interface TradingConfig {
  /** 백테스트·실매매에 쓸 총 투입 원금 */
  capital: number;
  entry: EntryRule;
  exit: ExitRule;
  risk: RiskRule;
  costs: CostRule;
  /** 지표가 안정되기까지 건너뛸 봉 수. SMA60 을 쓰므로 60 미만으로 내리지 말 것 */
  warmupBars: number;
  /**
   * 소수점 매수 허용. false 면 정수주만 산다.
   *
   * 미국에서 켜는 이유: 원금 $2,100 · 1회 리스크 1%($21) 로는 손절폭이 $21 을 넘는
   * 종목을 **1주도 못 산다** — 실제로 상위 12종목 중 9종목이 '0주' 로 걸러졌고,
   * 5종목 분산 전략이 1주짜리 2종목으로 쪼그라들었다. 그 상태의 성적표는 전략이 아니라
   * 정수주 제약을 측정한 것이다. 한국투자·토스 실계좌가 미국주식 소수점을 지원하므로
   * 이 가정은 실전보다 유리한 쪽으로 기울지 않는다.
   *
   * 국내는 소수점 매매가 일반적이지 않아 false 로 둔다.
   */
  fractionalShares: boolean;

  /** 어느 시장 규칙으로 풀린 설정인가. null = 공통 기본값만 */
  market: Market | null;
  marketLabel: string | null;
  /** 그 시장을 그렇게 잡은 이유 — 화면 [📐 방법론] 에 그대로 나온다 */
  marketNote: string | null;
  /** 워크포워드를 통과한 날짜. null 이면 아직 검증 안 된 가설이다 */
  verifiedAt: string | null;
}

/** 시장별로 덮어쓸 수 있는 부분. 원금·워밍업은 공통이라 여기 없다 */
export interface MarketOverride {
  label?: string;
  note?: string;
  verifiedAt?: string | null;
  /**
   * 이 시장의 원금. **통화가 다르므로 반드시 시장마다 따로 잡는다.**
   * 엔진은 환산을 하지 않아서, 공통 capital 3,000,000 을 미국에 그대로 쓰면
   * 300만원이 아니라 $3,000,000(약 40억원)으로 매매한다 — 실제로 그 상태로
   * 미국 페이퍼가 5일간 돌았다. 안 적으면 공통값을 그대로 물려받으니 주의.
   */
  capital?: number;
  /** 소수점 매수 허용 (미국처럼 주가가 높아 정수주로는 규칙이 안 도는 시장) */
  fractionalShares?: boolean;
  entry?: Partial<EntryRule>;
  exit?: Partial<ExitRule>;
  risk?: Partial<RiskRule>;
  costs?: Partial<Omit<CostRule, "sellTaxBps">> & { sellTaxBps?: Partial<CostRule["sellTaxBps"]> };
}

/** config/stock-trading.json 의 실제 모양 (사람이 쓰는 쪽 — 전부 선택) */
export interface TradingConfigFile {
  capital?: number;
  entry?: Partial<EntryRule>;
  exit?: Partial<ExitRule>;
  risk?: Partial<RiskRule>;
  costs?: Partial<Omit<CostRule, "sellTaxBps">> & { sellTaxBps?: Partial<CostRule["sellTaxBps"]> };
  warmupBars?: number;
  fractionalShares?: boolean;
  markets?: Partial<Record<Market, MarketOverride>>;
}

export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  capital: 3_000_000,
  entry: {
    minNetScore: 4,
    requireUptrend: true,
    maxOpenPositions: 5,
    maxPerIndustry: null,
    cooldownDays: 5,
  },
  exit: {
    stopLossAtrMult: 2,
    takeProfitAtrMult: 4,
    trailingAtrMult: null,
    maxHoldDays: 20,
    exitOnSellVerdict: true,
  },
  risk: {
    riskPerTradePct: 1,
    maxPositionPct: 20,
    dailyLossLimitPct: 3,
  },
  costs: {
    commissionBps: 1.5,
    slippageBps: 10,
    sellTaxBps: { KR: 15, US: 0 },
  },
  warmupBars: 60,
  fractionalShares: false,
  market: null,
  marketLabel: null,
  marketNote: null,
  verifiedAt: null,
};

export const MARKET_FALLBACK_LABEL: Record<Market, string> = {
  KR: "국내 (코스피·코스닥)",
  US: "미국 (나스닥·NYSE)",
};

function readFileRaw(): TradingConfigFile {
  try {
    return JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf8")) as TradingConfigFile;
  } catch {
    return {};
  }
}

/** 공통 기본값 층 — 시장 층을 얹기 전의 상태 */
function mergeCommon(raw: TradingConfigFile): TradingConfig {
  const d = DEFAULT_TRADING_CONFIG;
  return {
    capital: raw.capital ?? d.capital,
    entry: { ...d.entry, ...(raw.entry ?? {}) },
    exit: { ...d.exit, ...(raw.exit ?? {}) },
    risk: { ...d.risk, ...(raw.risk ?? {}) },
    costs: {
      ...d.costs,
      ...(raw.costs ?? {}),
      sellTaxBps: { ...d.costs.sellTaxBps, ...(raw.costs?.sellTaxBps ?? {}) },
    },
    warmupBars: raw.warmupBars ?? d.warmupBars,
    fractionalShares: raw.fractionalShares ?? d.fractionalShares,
    market: null,
    marketLabel: null,
    marketNote: null,
    verifiedAt: null,
  };
}

/** 공통 층 위에 시장 층을 얹는다 */
function applyMarket(base: TradingConfig, market: Market, ov: MarketOverride | undefined): TradingConfig {
  return {
    ...base,
    capital: ov?.capital ?? base.capital,
    fractionalShares: ov?.fractionalShares ?? base.fractionalShares,
    entry: { ...base.entry, ...(ov?.entry ?? {}) },
    exit: { ...base.exit, ...(ov?.exit ?? {}) },
    risk: { ...base.risk, ...(ov?.risk ?? {}) },
    costs: {
      ...base.costs,
      ...(ov?.costs ?? {}),
      sellTaxBps: { ...base.costs.sellTaxBps, ...(ov?.costs?.sellTaxBps ?? {}) },
    },
    market,
    marketLabel: ov?.label ?? MARKET_FALLBACK_LABEL[market],
    marketNote: ov?.note ?? null,
    verifiedAt: ov?.verifiedAt ?? null,
  };
}

/**
 * 섹션 단위 얕은 병합 — 사용자가 바꾸고 싶은 키만 적어도 나머지는 기본값이 채워진다.
 *
 * market 을 주면 그 시장 규칙까지 얹어서 돌려준다. **백테스트·스윕·워크포워드는
 * 반드시 시장을 넘겨야 한다** — 안 넘기면 공통값으로 도는데, 그게 바로 8-4 에서
 * 미국을 국내 규칙으로 굴려 -13.1% 가 나왔던 상태다.
 */
export function loadTradingConfig(market?: Market): TradingConfig {
  const raw = readFileRaw();
  const base = mergeCommon(raw);
  if (!market) return base;
  return applyMarket(base, market, raw.markets?.[market]);
}

/** 두 시장 규칙을 한 번에 — 화면 [📐 방법론] 비교표가 쓴다 */
export function loadAllMarketConfigs(): Record<Market, TradingConfig> {
  const raw = readFileRaw();
  const base = mergeCommon(raw);
  return {
    KR: applyMarket(base, "KR", raw.markets?.KR),
    US: applyMarket(base, "US", raw.markets?.US),
  };
}

export function saveTradingConfig(file: TradingConfigFile): void {
  fs.mkdirSync(path.dirname(TRADING_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(TRADING_CONFIG_FILE, JSON.stringify(file, null, 2), "utf8");
}

/**
 * 설정이 서로 모순되지 않는지 검사. 반환값은 사람이 읽는 경고 목록이며,
 * 비어 있지 않아도 실행은 막지 않는다 (일부러 그렇게 두고 실험할 수 있으므로).
 */
export function validateTradingConfig(cfg: TradingConfig): string[] {
  const warn: string[] = [];
  const rr = cfg.exit.takeProfitAtrMult / cfg.exit.stopLossAtrMult;
  if (rr < 1.5) {
    warn.push(
      `손익비(RR)가 ${rr.toFixed(2)}:1 입니다. 1.5 미만이면 승률 50% 를 넘겨야 본전이라 현실적으로 어렵습니다.`
    );
  }
  if (cfg.risk.riskPerTradePct > 2) {
    warn.push(
      `1회 리스크 ${cfg.risk.riskPerTradePct}% 는 큽니다. 10연패 시 원금의 ${(
        cfg.risk.riskPerTradePct * 10
      ).toFixed(0)}% 가 사라집니다.`
    );
  }
  if (cfg.risk.maxPositionPct * cfg.entry.maxOpenPositions < 100) {
    warn.push(
      `종목당 ${cfg.risk.maxPositionPct}% × ${cfg.entry.maxOpenPositions}종목 = 최대 ${
        cfg.risk.maxPositionPct * cfg.entry.maxOpenPositions
      }% 로, 현금이 항상 남습니다 (의도한 것이면 무시).`
    );
  }
  if (cfg.warmupBars < 60) {
    warn.push("warmupBars 가 60 미만이면 SMA60 이 비어 진입 필터가 무력화됩니다.");
  }
  if (cfg.market && !cfg.verifiedAt) {
    warn.push(
      `${cfg.marketLabel} 규칙은 아직 워크포워드 검증 전입니다 (가설). ` +
        `실계좌 승격 전에 npx tsx ../scripts/walk-forward.ts --market ${cfg.market} 를 통과해야 합니다.`
    );
  }
  return warn;
}

/* ── 규칙을 사람 문장으로 ───────────────────────────────────── */

/** 한 줄 요약 — 화면 요약 스트립과 CLI 헤더가 같은 문장을 쓴다 */
export function describeRules(cfg: TradingConfig): string {
  const parts = [
    `진입 점수 ≥${cfg.entry.minNetScore}`,
    `손절 ATR×${cfg.exit.stopLossAtrMult} / 익절 ×${cfg.exit.takeProfitAtrMult}`,
    cfg.exit.trailingAtrMult != null ? `트레일링 ×${cfg.exit.trailingAtrMult}` : null,
    `최대 ${cfg.exit.maxHoldDays}일 보유`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export interface RuleRow {
  section: "entry" | "exit" | "risk" | "costs";
  key: string;
  label: string;
  /** 이 손잡이가 무엇을 정하는지 한 줄 */
  hint: string;
  values: Record<Market, string>;
  /** 두 시장 값이 다른가 — 다른 줄만 강조해서 "무엇이 따로인지"가 바로 보이게 */
  differs: boolean;
}

const SECTION_LABEL: Record<RuleRow["section"], string> = {
  entry: "언제 사는가",
  exit: "언제 파는가",
  risk: "얼마를 거는가",
  costs: "거래비용",
};

export function sectionLabel(s: RuleRow["section"]): string {
  return SECTION_LABEL[s];
}

/**
 * 두 시장 규칙을 행 단위로 비교한다. 화면과 CLI 가 같은 표를 쓰도록
 * 포맷까지 여기서 정한다 — 양쪽에서 따로 찍으면 숫자가 어긋난다.
 */
export function compareMarketRules(cfgs: Record<Market, TradingConfig>): RuleRow[] {
  const bool = (v: boolean) => (v ? "예" : "아니오");
  const rows: Array<Omit<RuleRow, "values" | "differs"> & { get: (c: TradingConfig) => string }> = [
    {
      section: "entry",
      key: "minNetScore",
      label: "진입 최소 점수",
      hint: "매수-매도 순점수가 이 값 이상일 때만 산다. 높일수록 덜 사고 비용이 줄어든다",
      get: (c) => `≥ ${c.entry.minNetScore}`,
    },
    {
      section: "entry",
      key: "requireUptrend",
      label: "상승추세만 진입",
      hint: "60일선 위 + 60일선 상승일 때만. 떨어지는 칼날 잡기 방지",
      get: (c) => bool(c.entry.requireUptrend),
    },
    {
      section: "entry",
      key: "maxOpenPositions",
      label: "동시 보유 종목",
      hint: "슬롯 수. 적으면 좋은 신호를 놓치고, 많으면 자금이 얇게 퍼진다",
      get: (c) => `${c.entry.maxOpenPositions}종목`,
    },
    {
      section: "entry",
      key: "cooldownDays",
      label: "재진입 대기",
      hint: "청산 후 이 기간은 같은 종목을 다시 사지 않는다",
      get: (c) => `${c.entry.cooldownDays}일`,
    },
    {
      section: "exit",
      key: "stopLossAtrMult",
      label: "손절폭",
      hint: "진입가 − ATR × 배수. 이 폭이 1R 이고, 넓힐수록 휩소에 덜 잘린다",
      get: (c) => `ATR × ${c.exit.stopLossAtrMult}`,
    },
    {
      section: "exit",
      key: "takeProfitAtrMult",
      label: "익절폭",
      hint: "진입가 + ATR × 배수. 손절폭의 2배면 손익비 2:1",
      get: (c) => `ATR × ${c.exit.takeProfitAtrMult}`,
    },
    {
      section: "exit",
      key: "trailingAtrMult",
      label: "트레일링 스톱",
      hint: "손절선을 종가 뒤로 끌어올려 추세를 끝까지 태운다. 미사용이면 익절선에서 끊긴다",
      get: (c) => (c.exit.trailingAtrMult == null ? "미사용" : `ATR × ${c.exit.trailingAtrMult}`),
    },
    {
      section: "exit",
      key: "maxHoldDays",
      label: "최대 보유",
      hint: "이 영업일을 넘기면 손익과 무관하게 정리. 짧으면 긴 추세를 놓친다",
      get: (c) => `${c.exit.maxHoldDays}일`,
    },
    {
      section: "exit",
      key: "exitOnSellVerdict",
      label: "매도신호에 청산",
      hint: "RSI 과매수·데드크로스 등이 뜨면 판다. 끄면 손절·익절·기간만으로 관리한다",
      get: (c) => bool(c.exit.exitOnSellVerdict),
    },
    {
      section: "risk",
      key: "riskPerTradePct",
      label: "1회 리스크",
      hint: "손절까지 갔을 때 잃을 총자산 대비 비율. 주문 수량이 여기서 역산된다",
      get: (c) => `${c.risk.riskPerTradePct}%`,
    },
    {
      section: "risk",
      key: "maxPositionPct",
      label: "종목당 상한",
      hint: "변동성이 낮은 종목에 계좌가 통째로 실리는 것을 막는 뚜껑",
      get: (c) => `${c.risk.maxPositionPct}%`,
    },
    {
      section: "risk",
      key: "dailyLossLimitPct",
      label: "하루 손실 한도",
      hint: "이만큼 잃은 날은 신규 진입을 멈춘다 (킬스위치)",
      get: (c) => `${c.risk.dailyLossLimitPct}%`,
    },
    {
      section: "costs",
      key: "commissionBps",
      label: "수수료",
      hint: "왕복 각각 붙는다. 미국주식은 국내보다 몇 배 비싸다",
      get: (c) => `${c.costs.commissionBps}bp (${(c.costs.commissionBps / 100).toFixed(3)}%)`,
    },
    {
      section: "costs",
      key: "slippageBps",
      label: "슬리피지",
      hint: "호가에 밀려 불리하게 체결되는 정도. 백테스트를 보수적으로 만드는 값",
      get: (c) => `${c.costs.slippageBps}bp`,
    },
    {
      section: "costs",
      key: "sellTaxBps",
      label: "매도 세금",
      hint: "국내는 거래세 0.15%, 미국 주식은 거래세가 없다 (양도세는 계좌 밖 문제)",
      get: (c) => `${c.costs.sellTaxBps[c.market ?? "KR"]}bp`,
    },
  ];

  return rows.map((r) => {
    const values = { KR: r.get(cfgs.KR), US: r.get(cfgs.US) };
    const { get, ...rest } = r;
    return { ...rest, values, differs: values.KR !== values.US };
  });
}
