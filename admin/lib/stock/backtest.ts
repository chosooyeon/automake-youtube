/**
 * 백테스트 엔진 — "이 규칙대로 과거에 매매했다면 얼마를 벌었나"를 계산한다.
 *
 * 존재 이유: signals.ts 는 진입 신호만 낸다. 신호가 좋아 보이는 것과 돈을 버는 것은
 * 별개이고, 그 차이는 청산 규칙·포지션 크기·거래비용에서 갈린다.
 * API 를 붙이기 전에 이 셋을 넣고 과거 데이터로 돌려서 기댓값이 양수인지부터 확인한다.
 *
 * ── 미래 참조(lookahead) 방지 규칙 ─────────────────────────────
 * 이 엔진이 지키는 단 하나의 원칙: **판정에 쓰는 데이터는 전부 어제까지의 것**이다.
 *   1. i-1 봉 종가까지로 신호를 계산한다 (analyze 에 candles.slice(0, i) 를 넘긴다)
 *   2. 주문은 i 봉 **시가**에 체결한다 — 종가 체결로 잡으면 그날 하루를 공짜로 아는 셈
 *   3. 손절·익절은 i 봉의 고가/저가로 장중 도달을 판정한다
 *   4. 한 봉 안에서 손절과 익절에 모두 닿았으면 **손절을 먼저** 맞은 것으로 본다
 * 4번이 비관적으로 보이지만, 일봉만으로는 어느 쪽이 먼저였는지 알 수 없다.
 * 낙관적으로 잡으면 백테스트 성적이 실제보다 좋게 나오고, 그 착각의 대가는 실제 돈이다.
 *
 * 속도보다 정확성을 택했다: 매 봉마다 analyze() 를 슬라이스로 다시 부른다(O(n²)).
 * 종목 10개 × 600봉이면 수 초 걸리지만, 지표를 미리 통째로 계산해두고 인덱싱하는 방식은
 * 실수로 미래 값을 참조하기 쉬워 백테스트 오류의 단골 원인이다.
 */

import { atr } from "./indicators";
import type { Candle, Market, StockRef } from "./naver";
import { analyze, type Analysis } from "./signals";
import type { TradingConfig } from "./tradingConfig";

export interface SymbolData {
  ref: StockRef;
  candles: Candle[];
  /** 업종코드 (국내). 없으면 업종 제약을 받지 않는다 */
  industry?: string;
}

export type ExitReason = "stop" | "target" | "trail" | "signal" | "maxhold" | "open_at_end";

export const EXIT_REASON_LABEL: Record<ExitReason, string> = {
  stop: "손절",
  target: "익절",
  trail: "트레일링 손절",
  signal: "매도신호",
  maxhold: "보유기간 초과",
  open_at_end: "기간종료(강제청산)",
};

export interface Trade {
  symbol: string;
  name: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  reason: ExitReason;
  /** 보유 영업일 수 (봉 개수) */
  holdBars: number;
  /** 비용까지 뺀 실현손익 (통화) */
  pnl: number;
  /** 진입금액 대비 손익률 % */
  pnlPct: number;
  /** 손절폭(1R) 대비 몇 배를 벌었나 — 전략 비교의 공통 단위 */
  r: number;
  /** 수수료 + 세금 (슬리피지는 체결가에 이미 녹아 있다) */
  fees: number;
  /** 진입 근거가 된 신호 라벨들 */
  entrySignals: string[];
}

export interface EquityPoint {
  date: string;
  /** 현금 + 보유주식 평가액 */
  equity: number;
  cash: number;
  openPositions: number;
}

export interface BacktestMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  /** 평균 수익 거래의 손익률 % */
  avgWinPct: number;
  /** 평균 손실 거래의 손익률 % (음수) */
  avgLossPct: number;
  /** 실현 손익비 = 평균수익 / |평균손실| */
  payoffRatio: number;
  /** 총이익 / 총손실. 1.3 이상이면 쓸만하다 */
  profitFactor: number;
  /** 1회 매매당 기댓값 (R 단위). 이게 양수가 아니면 전략이 아니다 */
  expectancyR: number;
  totalReturnPct: number;
  /** 연복리 수익률 % */
  cagrPct: number;
  /** 최대 낙폭 % — CAGR 보다 중요하다. 이걸 견딜 수 있어야 전략을 지킨다 */
  maxDrawdownPct: number;
  /** 최대 낙폭에서 회복하는 데 걸린 최장 일수 */
  maxDrawdownDays: number;
  sharpe: number;
  avgHoldBars: number;
  /** 총 지불한 수수료·세금 */
  totalFees: number;
  /** 비용이 총손익에서 차지한 비중 % */
  feeDragPct: number;
  exitBreakdown: Record<ExitReason, number>;
  startDate: string;
  endDate: string;
  years: number;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  /** 같은 기간·같은 종목을 균등 매수 후 보유했을 때의 수익률 % — 이걸 못 이기면 전략이 무의미하다 */
  benchmarkReturnPct: number;
  benchmarkMaxDrawdownPct: number;
  trades: Trade[];
  equityCurve: EquityPoint[];
  /** 신호는 떴는데 진입하지 못한 횟수와 이유 — 조용히 잘라내면 "다 잡았다"고 착각한다 */
  skipped: { noCash: number; slotsFull: number; badStop: number; cooldown: number; industryFull: number };
  warnings: string[];
  config: TradingConfig;
  symbols: string[];
}

interface OpenPosition {
  symbol: string;
  name: string;
  market: Market;
  entryDate: string;
  entryPrice: number;
  shares: number;
  stopPrice: number;
  targetPrice: number;
  /** 진입 시점의 손절폭 = 1R */
  riskPerShare: number;
  entryFee: number;
  entryBarIndex: number;
  entrySignals: string[];
  trailed: boolean;
}

const BPS = 10_000;

/** 이상치 봉 제거 — 고가<저가 같은 깨진 데이터가 하나 섞이면 손절 판정이 통째로 망가진다 */
function sanitize(candles: Candle[]): Candle[] {
  return candles.filter(
    (c) =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.low > 0 &&
      c.high >= c.low &&
      c.open > 0
  );
}

function daysBetween(a: string, b: string): number {
  const toDate = (s: string) =>
    new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))).getTime();
  return Math.max(0, Math.round((toDate(b) - toDate(a)) / 86_400_000));
}

export interface RunBacktestOptions {
  /** 진행 상황 보고 (CLI 에서 종목별 진척 표시용) */
  onProgress?: (done: number, total: number, label: string) => void;
  /**
   * YYYYMMDD. 이 날짜부터만 **신규 진입**한다 (지표 워밍업은 그 전 봉으로 한다).
   *
   * 왜 필요한가: 진입 시작 시점은 원래 `warmupBars` 인덱스에 묶여 있었다. 그래서
   * "이 날부터 매매" 를 만들려면 딱 그만큼만 잘라 넘겨야 했는데, 그러면 시작 직후에는
   * 봉이 모자라 위의 `warmupBars + 5` 가드에 걸려 종목이 통째로 버려진다 —
   * 페이퍼 트레이딩이 첫 6거래일 동안 조용히 '거래일 0' 이 되던 원인이다.
   * 워밍업 봉을 넉넉히 주고 매매 시작만 날짜로 자르면 두 문제가 같이 풀린다.
   */
  tradeFrom?: string;
}

export function runBacktest(
  input: SymbolData[],
  cfg: TradingConfig,
  opts: RunBacktestOptions = {}
): BacktestResult {
  const warnings: string[] = [];

  // ── 0. 데이터 준비 ────────────────────────────────────────────
  const data = input
    .map((s) => ({ ref: s.ref, candles: sanitize(s.candles), industry: s.industry }))
    .filter((s) => {
      if (s.candles.length <= cfg.warmupBars + 5) {
        warnings.push(`${s.ref.name}: 봉 ${s.candles.length}개로 부족해 제외했습니다.`);
        return false;
      }
      return true;
    });

  if (data.length === 0) {
    throw new Error("백테스트할 수 있는 종목이 없습니다 (데이터 부족).");
  }

  const markets = new Set(data.map((s) => s.ref.market));
  if (markets.size > 1) {
    warnings.push(
      "국내·미국 종목이 섞여 있습니다. 통화(원/달러)를 환산하지 않으므로 금액 지표를 신뢰하지 마세요. --market 으로 나눠 돌리는 것을 권합니다."
    );
  }

  /** 종목별: 날짜 → 인덱스, ATR, 그리고 각 봉 시점의 판정 */
  const prepared = data.map((s, si) => {
    opts.onProgress?.(si, data.length, s.ref.name);
    const idxByDate = new Map<string, number>();
    s.candles.forEach((c, i) => idxByDate.set(c.date, i));
    const atrArr = atr(s.candles, 14);

    // i 번째 원소 = "i-1 봉 종가까지만 보고 내린 판정" → i 봉 시가에 주문할 때 쓴다
    const decision: (Analysis | null)[] = new Array(s.candles.length).fill(null);
    for (let i = cfg.warmupBars; i < s.candles.length; i++) {
      decision[i] = analyze(s.candles.slice(0, i));
    }
    return { ...s, idxByDate, atrArr, decision };
  });
  opts.onProgress?.(data.length, data.length, "완료");

  // ── 1. 거래일 축 (여러 종목의 날짜 합집합) ────────────────────
  const allDates = [...new Set(prepared.flatMap((s) => s.candles.map((c) => c.date)))].sort();

  // ── 2. 시뮬레이션 ─────────────────────────────────────────────
  let cash = cfg.capital;
  const positions = new Map<string, OpenPosition>();
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  const skipped = { noCash: 0, slotsFull: 0, badStop: 0, cooldown: 0, industryFull: 0 };
  const lastExitDate = new Map<string, string>();
  /** 심볼 → 업종코드. 업종을 못 받은 종목은 아예 안 들어간다 (= 제약 없음) */
  const industryBySymbol = new Map<string, string>();
  for (const s0 of data) if (s0.industry) industryBySymbol.set(s0.ref.symbol, s0.industry);
  const lastClose = new Map<string, number>();

  const commission = cfg.costs.commissionBps / BPS;
  const slip = cfg.costs.slippageBps / BPS;
  const taxOf = (m: Market) => cfg.costs.sellTaxBps[m] / BPS;

  const markToMarket = (): number => {
    let mv = 0;
    for (const p of positions.values()) mv += p.shares * (lastClose.get(p.symbol) ?? p.entryPrice);
    return cash + mv;
  };

  const closePosition = (
    p: OpenPosition,
    rawPrice: number,
    date: string,
    barIndex: number,
    reason: ExitReason
  ): void => {
    const fillPrice = rawPrice * (1 - slip);
    const gross = fillPrice * p.shares;
    const exitFee = gross * (commission + taxOf(p.market));
    cash += gross - exitFee;

    const fees = p.entryFee + exitFee;
    const pnl = gross - exitFee - (p.entryPrice * p.shares + p.entryFee);
    const invested = p.entryPrice * p.shares;
    trades.push({
      symbol: p.symbol,
      name: p.name,
      entryDate: p.entryDate,
      entryPrice: p.entryPrice,
      exitDate: date,
      exitPrice: fillPrice,
      shares: p.shares,
      reason,
      holdBars: barIndex - p.entryBarIndex,
      pnl,
      pnlPct: invested > 0 ? (pnl / invested) * 100 : 0,
      r: p.riskPerShare > 0 ? pnl / (p.riskPerShare * p.shares) : 0,
      fees,
      entrySignals: p.entrySignals,
    });
    positions.delete(p.symbol);
    lastExitDate.set(p.symbol, date);
  };

  let prevEquity = cfg.capital;

  for (const date of allDates) {
    const dayStartEquity = prevEquity;

    // ── 2-1. 청산 먼저 (오늘 봉으로 판정) ───────────────────────
    for (const s of prepared) {
      const i = s.idxByDate.get(date);
      if (i == null) continue;
      const bar = s.candles[i];
      lastClose.set(s.ref.symbol, bar.close);

      const p = positions.get(s.ref.symbol);
      if (!p) continue;

      // (a) 어제 종가 기준 매도신호 → 오늘 시가 청산
      const dec = s.decision[i];
      if (
        cfg.exit.exitOnSellVerdict &&
        dec &&
        (dec.verdict === "SELL" || dec.verdict === "STRONG_SELL")
      ) {
        closePosition(p, bar.open, date, i, "signal");
        continue;
      }

      // (b) 갭하락으로 시가가 이미 손절선 아래면 손절선이 아니라 시가에 체결된다
      if (bar.open <= p.stopPrice) {
        closePosition(p, bar.open, date, i, p.trailed ? "trail" : "stop");
        continue;
      }
      // (c) 장중 손절 — 익절과 같은 봉에서 겹치면 손절을 먼저 맞은 것으로 본다 (보수적)
      if (bar.low <= p.stopPrice) {
        closePosition(p, p.stopPrice, date, i, p.trailed ? "trail" : "stop");
        continue;
      }
      // (d) 장중 익절 (갭상승이면 목표가보다 유리한 시가에 체결)
      if (bar.high >= p.targetPrice) {
        closePosition(p, Math.max(bar.open, p.targetPrice), date, i, "target");
        continue;
      }
      // (e) 보유기간 초과 → 종가 청산
      if (i - p.entryBarIndex >= cfg.exit.maxHoldDays) {
        closePosition(p, bar.close, date, i, "maxhold");
        continue;
      }
      // (f) 트레일링 스톱은 종가 확정 후 위로만 끌어올린다
      if (cfg.exit.trailingAtrMult != null) {
        const a = s.atrArr[i];
        if (a != null) {
          const newStop = bar.close - a * cfg.exit.trailingAtrMult;
          if (newStop > p.stopPrice) {
            p.stopPrice = newStop;
            p.trailed = true;
          }
        }
      }
    }

    // ── 2-2. 킬스위치: 오늘 손실이 한도를 넘으면 신규 진입 금지 ──
    const equityNow = markToMarket();
    const dayLossPct =
      dayStartEquity > 0 ? ((equityNow - dayStartEquity) / dayStartEquity) * 100 : 0;
    const killed = dayLossPct <= -cfg.risk.dailyLossLimitPct;

    // ── 2-3. 진입 (어제 종가 신호 → 오늘 시가) ──────────────────
    if (!killed) {
      interface Candidate {
        s: (typeof prepared)[number];
        i: number;
        dec: Analysis;
      }
      const candidates: Candidate[] = [];

      for (const s of prepared) {
        const i = s.idxByDate.get(date);
        if (i == null || i < cfg.warmupBars) continue;
        // 워밍업 봉을 넉넉히 받은 경우, 시작일 전에는 사지 않는다
        if (opts.tradeFrom && date < opts.tradeFrom) continue;
        if (positions.has(s.ref.symbol)) continue;

        const dec = s.decision[i];
        if (!dec || dec.insufficientData) continue;
        if (dec.netScore < cfg.entry.minNetScore) continue;
        if (!dec.signals.some((g) => g.kind === "primary" && g.side === "buy")) continue;
        if (cfg.entry.requireUptrend && !dec.signals.some((g) => g.id === "uptrend_filter")) continue;

        const prevExit = lastExitDate.get(s.ref.symbol);
        if (prevExit && daysBetween(prevExit, date) < cfg.entry.cooldownDays) {
          skipped.cooldown++;
          continue;
        }
        candidates.push({ s, i, dec });
      }

      // 슬롯이 모자라면 점수 높은 순 (동점은 심볼 사전순 — 실행할 때마다 결과가 달라지면 안 된다)
      candidates.sort(
        (a, b) => b.dec.netScore - a.dec.netScore || a.s.ref.symbol.localeCompare(b.s.ref.symbol)
      );

      // 지금 들고 있는 포지션의 업종 분포 — 후보를 하나씩 채택할 때마다 갱신한다
      const industryCount = new Map<string, number>();
      if (cfg.entry.maxPerIndustry != null) {
        for (const sym of positions.keys()) {
          const ind = industryBySymbol.get(sym);
          if (ind) industryCount.set(ind, (industryCount.get(ind) ?? 0) + 1);
        }
      }

      for (const c of candidates) {
        if (positions.size >= cfg.entry.maxOpenPositions) {
          skipped.slotsFull++;
          continue;
        }

        // 업종 상한. 업종을 모르는 종목(ind 없음)은 제약 없이 통과시킨다 —
        // 모른다는 이유로 기회를 지우면 결과가 조용히 왜곡된다
        const ind = cfg.entry.maxPerIndustry != null ? industryBySymbol.get(c.s.ref.symbol) : undefined;
        if (ind && (industryCount.get(ind) ?? 0) >= cfg.entry.maxPerIndustry!) {
          skipped.industryFull++;
          continue;
        }
        const bar = c.s.candles[c.i];
        const a = c.s.atrArr[c.i - 1]; // 어제까지의 ATR — 오늘 값을 쓰면 미래 참조다
        if (a == null || a <= 0) {
          skipped.badStop++;
          continue;
        }

        const entryPrice = bar.open * (1 + slip);
        const riskPerShare = a * cfg.exit.stopLossAtrMult;
        const stopPrice = entryPrice - riskPerShare;
        if (stopPrice <= 0) {
          skipped.badStop++;
          continue;
        }

        const equity = markToMarket();
        const riskAmount = equity * (cfg.risk.riskPerTradePct / 100);

        // 소수점 매수를 허용하면 자르지 않는다. 정수주 강제는 원금이 작을 때
        // "규칙은 사라고 했는데 1주를 못 사서 0주" 를 만들어, 전략이 아니라
        // 원금 부족을 측정하게 된다 (미국 $2,100 에서 상위 12종목 중 9종목이 그랬다).
        const round = (n: number) => (cfg.fractionalShares ? n : Math.floor(n));
        // 소수점이라도 먼지 같은 수량은 의미가 없다 — 소수 6자리에서 끊는다
        const trim = (n: number) => (cfg.fractionalShares ? Math.floor(n * 1e6) / 1e6 : n);

        let shares = trim(round(riskAmount / riskPerShare));

        // 변동성이 아주 낮은 종목은 리스크 룰만으로 계좌 전체를 넘길 수 있어 비중 상한을 건다
        const maxByWeight = trim(round((equity * (cfg.risk.maxPositionPct / 100)) / entryPrice));
        shares = Math.min(shares, maxByWeight);

        const unitCost = entryPrice * (1 + commission);
        if (shares * unitCost > cash) shares = trim(round(cash / unitCost));

        // 정수주면 1주 미만, 소수점이면 사실상 0 인 경우를 같이 거른다
        if (shares <= 0 || shares * unitCost < 0.01) {
          skipped.noCash++;
          continue;
        }

        const gross = entryPrice * shares;
        const entryFee = gross * commission;
        cash -= gross + entryFee;

        const pos: OpenPosition = {
          symbol: c.s.ref.symbol,
          name: c.s.ref.name,
          market: c.s.ref.market,
          entryDate: date,
          entryPrice,
          shares,
          stopPrice,
          targetPrice: entryPrice + a * cfg.exit.takeProfitAtrMult,
          riskPerShare,
          entryFee,
          entryBarIndex: c.i,
          entrySignals: c.dec.signals
            .filter((g) => g.side === "buy" && g.kind === "primary")
            .map((g) => g.label),
          trailed: false,
        };
        positions.set(c.s.ref.symbol, pos);
        if (ind) industryCount.set(ind, (industryCount.get(ind) ?? 0) + 1);

        // 진입 당일 장중에 이미 손절/익절에 닿는 경우 (당일 왕복).
        // 이걸 빼면 "산 날은 절대 안 잘린다"는 낙관적 가정이 들어간다.
        if (bar.low <= pos.stopPrice) closePosition(pos, pos.stopPrice, date, c.i, "stop");
        else if (bar.high >= pos.targetPrice) closePosition(pos, pos.targetPrice, date, c.i, "target");
      }
    }

    const equity = markToMarket();
    equityCurve.push({ date, equity, cash, openPositions: positions.size });
    prevEquity = equity;
  }

  // 기간 종료 시점에 남은 포지션은 마지막 종가로 강제 청산 (평가익을 실현익처럼 세지 않기 위해)
  for (const p of [...positions.values()]) {
    const s = prepared.find((x) => x.ref.symbol === p.symbol);
    if (!s) continue;
    const i = s.candles.length - 1;
    closePosition(p, s.candles[i].close, s.candles[i].date, i, "open_at_end");
  }
  if (equityCurve.length > 0) {
    equityCurve[equityCurve.length - 1] = {
      ...equityCurve[equityCurve.length - 1],
      equity: cash,
      cash,
      openPositions: 0,
    };
  }

  return {
    metrics: computeMetrics(trades, equityCurve, cfg),
    ...computeBenchmark(prepared, cfg),
    trades,
    equityCurve,
    skipped,
    warnings,
    config: cfg,
    symbols: data.map((s) => s.ref.name),
  };
}

function computeMetrics(
  trades: Trade[],
  curve: EquityPoint[],
  cfg: TradingConfig
): BacktestMetrics {
  const exitBreakdown = {
    stop: 0,
    target: 0,
    trail: 0,
    signal: 0,
    maxhold: 0,
    open_at_end: 0,
  } as Record<ExitReason, number>;
  for (const t of trades) exitBreakdown[t.reason]++;

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  const avgWinPct = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;

  const startDate = curve[0]?.date ?? "";
  const endDate = curve[curve.length - 1]?.date ?? "";
  const years = startDate && endDate ? Math.max(daysBetween(startDate, endDate) / 365.25, 1 / 365.25) : 0;

  const finalEquity = curve[curve.length - 1]?.equity ?? cfg.capital;
  const totalReturnPct = ((finalEquity - cfg.capital) / cfg.capital) * 100;
  const cagrPct =
    years > 0 && finalEquity > 0 ? ((finalEquity / cfg.capital) ** (1 / years) - 1) * 100 : 0;

  // 최대 낙폭 + 그 낙폭에서 회복하기까지 걸린 최장 기간
  let peak = -Infinity;
  let peakDate = startDate;
  let maxDd = 0;
  let maxDdDays = 0;
  for (const p of curve) {
    if (p.equity > peak) {
      peak = p.equity;
      peakDate = p.date;
    }
    const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
    if (dd > 0) maxDdDays = Math.max(maxDdDays, daysBetween(peakDate, p.date));
  }

  // 일간 수익률 기반 샤프 (무위험수익률 0 가정 — 상대비교용이지 절대값을 신봉하지 말 것)
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    if (prev > 0) rets.push((curve[i].equity - prev) / prev);
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length
    ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length)
    : 0;
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;

  const totalFees = trades.reduce((a, t) => a + t.fees, 0);
  const netPnl = trades.reduce((a, t) => a + t.pnl, 0);

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    avgWinPct,
    avgLossPct,
    payoffRatio: avgLossPct !== 0 ? Math.abs(avgWinPct / avgLossPct) : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancyR: trades.length ? trades.reduce((a, t) => a + t.r, 0) / trades.length : 0,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: maxDd,
    maxDrawdownDays: maxDdDays,
    sharpe,
    avgHoldBars: trades.length ? trades.reduce((a, t) => a + t.holdBars, 0) / trades.length : 0,
    totalFees,
    feeDragPct: Math.abs(netPnl) + totalFees > 0 ? (totalFees / (Math.abs(netPnl) + totalFees)) * 100 : 0,
    exitBreakdown,
    startDate,
    endDate,
    years,
  };
}

/**
 * 벤치마크: 같은 종목을 균등 비중으로 사서 끝까지 들고 있었다면.
 * 전략이 이걸 못 이기면 매매할 이유가 없다 — 그냥 사서 묻어두면 되니까.
 */
function computeBenchmark(
  prepared: { ref: StockRef; candles: Candle[] }[],
  cfg: TradingConfig
): { benchmarkReturnPct: number; benchmarkMaxDrawdownPct: number } {
  const per = cfg.capital / prepared.length;
  const holdings = prepared.map((s) => {
    const start = s.candles[cfg.warmupBars] ?? s.candles[0];
    return { s, shares: per / start.open, startDate: start.date };
  });

  const dates = [...new Set(prepared.flatMap((s) => s.candles.map((c) => c.date)))].sort();
  const lastPx = new Map<string, number>();
  let peak = -Infinity;
  let maxDd = 0;
  let final = cfg.capital;

  for (const d of dates) {
    let total = 0;
    for (const h of holdings) {
      const c = h.s.candles.find((x) => x.date === d);
      if (c) lastPx.set(h.s.ref.symbol, c.close);
      const px = lastPx.get(h.s.ref.symbol);
      total += px != null && d >= h.startDate ? h.shares * px : per;
    }
    if (total > peak) peak = total;
    const dd = peak > 0 ? ((peak - total) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
    final = total;
  }

  return {
    benchmarkReturnPct: ((final - cfg.capital) / cfg.capital) * 100,
    benchmarkMaxDrawdownPct: maxDd,
  };
}

// ─────────────────────────────────────────────────────────────
// 리포트 (CLI · admin 공용)
// ─────────────────────────────────────────────────────────────

function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "-";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function money(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

/**
 * 성적표를 사람이 읽는 판정문까지 붙여서 돌려준다.
 * 숫자만 보여주면 "수익률 +30%!" 만 눈에 들어오고 MDD·표본수는 안 보게 된다.
 */
export function formatReport(r: BacktestResult): string {
  const m = r.metrics;
  const L: string[] = [];
  const line = "─".repeat(52);

  L.push(line);
  L.push(`백테스트 결과  ${m.startDate} ~ ${m.endDate} (${m.years.toFixed(1)}년)`);
  L.push(`종목 ${r.symbols.length}개: ${r.symbols.join(", ")}`);
  L.push(`원금 ${money(r.config.capital)} · 1회 리스크 ${r.config.risk.riskPerTradePct}% · 손절 ATR×${r.config.exit.stopLossAtrMult} / 익절 ATR×${r.config.exit.takeProfitAtrMult}`);
  L.push(line);

  L.push("[수익]");
  L.push(`  총수익률        ${pct(m.totalReturnPct)}   (연복리 ${pct(m.cagrPct)})`);
  L.push(`  단순보유 대비   ${pct(m.totalReturnPct - r.benchmarkReturnPct)}   (보유 ${pct(r.benchmarkReturnPct)})`);
  L.push(`  최대낙폭(MDD)   -${m.maxDrawdownPct.toFixed(1)}%   회복까지 최장 ${m.maxDrawdownDays}일`);
  L.push(`  단순보유 MDD    -${r.benchmarkMaxDrawdownPct.toFixed(1)}%`);
  L.push(`  샤프            ${m.sharpe.toFixed(2)}`);

  L.push("");
  L.push("[매매]");
  L.push(`  거래 ${m.trades}회 (승 ${m.wins} / 패 ${m.losses}) · 승률 ${m.winRatePct.toFixed(1)}%`);
  L.push(`  평균수익 ${pct(m.avgWinPct)} / 평균손실 ${pct(m.avgLossPct)} → 손익비 ${m.payoffRatio.toFixed(2)}:1`);
  L.push(`  Profit Factor   ${Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"}`);
  L.push(`  기대값          ${m.expectancyR >= 0 ? "+" : ""}${m.expectancyR.toFixed(3)}R / 거래`);
  L.push(`  평균보유        ${m.avgHoldBars.toFixed(1)}봉`);
  L.push(
    `  청산사유        ` +
      (Object.entries(m.exitBreakdown) as [ExitReason, number][])
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${EXIT_REASON_LABEL[k]} ${v}`)
        .join(" · ")
  );

  L.push("");
  L.push("[비용]");
  L.push(`  수수료+세금     ${money(m.totalFees)}  (손익의 ${m.feeDragPct.toFixed(1)}%)`);

  const sk = r.skipped;
  if (sk.noCash + sk.slotsFull + sk.badStop + sk.cooldown + sk.industryFull > 0) {
    L.push("");
    L.push("[놓친 신호] — 규칙상 진입하지 않은 것이지 버그가 아닙니다");
    L.push(
      `  현금부족 ${sk.noCash} · 슬롯참 ${sk.slotsFull} · 재진입대기 ${sk.cooldown} · 업종상한 ${sk.industryFull} · ATR없음 ${sk.badStop}`
    );
  }

  L.push("");
  L.push(line);
  L.push("[판정]");
  for (const v of verdictLines(r)) L.push(`  ${v}`);
  L.push(line);

  if (r.warnings.length) {
    L.push("");
    L.push("[경고]");
    for (const w of r.warnings) L.push(`  ⚠ ${w}`);
  }
  return L.join("\n");
}

/** 숫자를 합격/불합격으로 번역한다. 기준은 docs/STOCK-TRADING.md 와 같아야 한다 */
export function verdictLines(r: BacktestResult): string[] {
  const m = r.metrics;
  const out: string[] = [];
  const mark = (ok: boolean) => (ok ? "✅" : "❌");

  const sampleOk = m.trades >= 100;
  out.push(
    `${mark(sampleOk)} 표본 ${m.trades}회 — ${
      sampleOk ? "통계로 볼 만합니다" : "100회 미만은 통계가 아니라 우연입니다. 기간이나 종목을 늘리세요"
    }`
  );

  // 합격선 0.1R — 0 을 겨우 넘는 값은 비용·슬리피지 오차에 그대로 잡아먹힌다 (docs/STOCK-TRADING.md 3절)
  const expOk = m.expectancyR >= 0.1;
  out.push(
    `${mark(expOk)} 기대값 ${m.expectancyR.toFixed(3)}R — ${
      expOk
        ? "1회 매매마다 평균적으로 벌었습니다"
        : m.expectancyR > 0
          ? "양수지만 기준 0.1R 미달 — 비용 오차에 지워질 수준입니다"
          : "음수입니다. 이대로면 매매할수록 잃습니다"
    }`
  );

  const pfOk = m.profitFactor >= 1.3;
  out.push(
    `${mark(pfOk)} Profit Factor ${Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} — 기준 1.3`
  );

  const ddOk = m.maxDrawdownPct <= 25;
  out.push(
    `${mark(ddOk)} MDD -${m.maxDrawdownPct.toFixed(1)}% — ${
      ddOk
        ? "견딜 만합니다"
        : `원금 ${money(r.config.capital)} 이면 ${money((r.config.capital * m.maxDrawdownPct) / 100)} 이 녹는 구간을 버텨야 합니다`
    }`
  );

  const beatsHold = m.totalReturnPct > r.benchmarkReturnPct;
  out.push(
    `${mark(beatsHold)} 단순보유 대비 ${pct(m.totalReturnPct - r.benchmarkReturnPct)} — ${
      beatsHold ? "매매할 이유가 있습니다" : "그냥 사서 묻어두는 게 나았습니다"
    }`
  );

  const allOk = sampleOk && expOk && pfOk && ddOk && beatsHold;
  out.push("");
  out.push(
    allOk
      ? "→ 5개 모두 통과. 다음 단계는 기간을 쪼갠 검증(2020~2024 튜닝 / 2025~ 검증)입니다."
      : "→ 통과하지 못한 항목이 있습니다. API 연결보다 규칙 수정이 먼저입니다."
  );
  return out;
}
