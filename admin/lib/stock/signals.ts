/**
 * 매수·매도 포인트 판정 엔진.
 *
 * 입력은 "확정된 일봉"뿐이다 (네이버 차트 API는 장 마감 후에 당일 봉을 준다).
 * 장중에 값이 바뀌며 신호가 나타났다 사라지는 리페인팅을 피하려는 의도 —
 * 실시간 현재가는 표시용으로만 쓰고 판정에는 넣지 않는다.
 *
 * 각 신호는 weight(1~3)를 갖고, 매수합-매도합의 순점수로 최종 판정을 낸다.
 * 어떤 지표도 단독으로 매매를 확정하지 않는다는 뜻 — 참고 지표다.
 */

import type { Candle } from "./naver";
import { bollinger, macd, rsi, sma } from "./indicators";

export type Verdict = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface Signal {
  /** 알림 중복 판정에 쓰는 안정적인 키 */
  id: string;
  side: "buy" | "sell";
  weight: number;
  label: string;
  detail: string;
  /**
   * primary = 그 자체가 매매 포인트인 신호 (크로스·과매도·밴드 이탈 등)
   * context = 추세 배경. 점수엔 반영되지만 이것만으로는 판정을 내리지 않는다
   *           ("60일선 아래"라는 이유만으로 매도 알림이 울리면 안 되니까)
   */
  kind: "primary" | "context";
}

export interface IndicatorSnapshot {
  close: number;
  date: string;
  rsi: number | null;
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  bbWidth: number | null;
  /** 20일 평균 거래량 대비 배수 */
  volumeRatio: number | null;
}

export interface Analysis {
  verdict: Verdict;
  buyScore: number;
  sellScore: number;
  netScore: number;
  signals: Signal[];
  snapshot: IndicatorSnapshot;
  /** 지표를 다 채우지 못했을 때 (상장 초기 등) */
  insufficientData: boolean;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG_BUY: "적극 매수 구간",
  BUY: "매수 관심",
  HOLD: "관망",
  SELL: "매도 관심",
  STRONG_SELL: "적극 매도 구간",
};

export const VERDICT_EMOJI: Record<Verdict, string> = {
  STRONG_BUY: "🟢🟢",
  BUY: "🟢",
  HOLD: "⚪",
  SELL: "🔴",
  STRONG_SELL: "🔴🔴",
};

function verdictOf(net: number): Verdict {
  if (net >= 4) return "STRONG_BUY";
  if (net >= 2) return "BUY";
  if (net <= -4) return "STRONG_SELL";
  if (net <= -2) return "SELL";
  return "HOLD";
}

/** 위로 통과했는가 (직전엔 아래·이번엔 위) */
function crossedUp(prevA: number | null, prevB: number | null, a: number | null, b: number | null): boolean {
  if (prevA == null || prevB == null || a == null || b == null) return false;
  return prevA <= prevB && a > b;
}

function fmt(n: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export function analyze(candles: Candle[]): Analysis {
  const closes = candles.map((c) => c.close);
  const i = closes.length - 1;

  const rsiArr = rsi(closes, 14);
  const sma5 = sma(closes, 5);
  const sma20 = sma(closes, 20);
  const sma60 = sma(closes, 60);
  const macdArr = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const volAvg20 = sma(candles.map((c) => c.volume), 20);

  const last = candles[i];
  const prev = candles[i - 1];

  const snapshot: IndicatorSnapshot = {
    close: last?.close ?? NaN,
    date: last?.date ?? "",
    rsi: rsiArr[i] ?? null,
    sma5: sma5[i] ?? null,
    sma20: sma20[i] ?? null,
    sma60: sma60[i] ?? null,
    macdHist: macdArr[i]?.hist ?? null,
    bbUpper: bb[i]?.upper ?? null,
    bbLower: bb[i]?.lower ?? null,
    bbWidth: bb[i]?.width ?? null,
    volumeRatio:
      volAvg20[i] != null && (volAvg20[i] as number) > 0
        ? last.volume / (volAvg20[i] as number)
        : null,
  };

  // 20일 지표조차 못 채우면 판정 자체를 포기한다 (신규 상장·데이터 결측)
  const insufficientData = closes.length < 30 || snapshot.rsi == null || snapshot.sma20 == null;
  if (insufficientData) {
    return {
      verdict: "HOLD",
      buyScore: 0,
      sellScore: 0,
      netScore: 0,
      signals: [],
      snapshot,
      insufficientData: true,
    };
  }

  const signals: Signal[] = [];
  const r = snapshot.rsi as number;

  // --- RSI 과매도/과매수 ---
  if (r <= 25) {
    signals.push({
      id: "rsi_deep_oversold",
      side: "buy",
      kind: "primary",
      weight: 3,
      label: "RSI 극과매도",
      detail: `RSI ${fmt(r)} — 25 이하. 반등 시도 구간`,
    });
  } else if (r <= 30) {
    signals.push({
      id: "rsi_oversold",
      side: "buy",
      kind: "primary",
      weight: 2,
      label: "RSI 과매도",
      detail: `RSI ${fmt(r)} — 30 이하`,
    });
  } else if (r >= 75) {
    signals.push({
      id: "rsi_deep_overbought",
      side: "sell",
      kind: "primary",
      weight: 3,
      label: "RSI 극과매수",
      detail: `RSI ${fmt(r)} — 75 이상. 단기 과열`,
    });
  } else if (r >= 70) {
    signals.push({
      id: "rsi_overbought",
      side: "sell",
      kind: "primary",
      weight: 2,
      label: "RSI 과매수",
      detail: `RSI ${fmt(r)} — 70 이상`,
    });
  }

  // --- 이동평균 골든/데드크로스 (5일선 vs 20일선) ---
  if (crossedUp(sma5[i - 1], sma20[i - 1], sma5[i], sma20[i])) {
    signals.push({
      id: "golden_cross",
      side: "buy",
      kind: "primary",
      weight: 3,
      label: "골든크로스",
      detail: `5일선(${fmt(snapshot.sma5, 0)})이 20일선(${fmt(snapshot.sma20, 0)})을 상향 돌파`,
    });
  }
  if (crossedUp(sma20[i - 1], sma5[i - 1], sma20[i], sma5[i])) {
    signals.push({
      id: "dead_cross",
      side: "sell",
      kind: "primary",
      weight: 3,
      label: "데드크로스",
      detail: `5일선(${fmt(snapshot.sma5, 0)})이 20일선(${fmt(snapshot.sma20, 0)})을 하향 이탈`,
    });
  }

  // --- MACD 히스토그램 부호 전환 ---
  const histNow = macdArr[i]?.hist ?? null;
  const histPrev = macdArr[i - 1]?.hist ?? null;
  if (histPrev != null && histNow != null) {
    if (histPrev <= 0 && histNow > 0) {
      signals.push({
        id: "macd_bull_cross",
        side: "buy",
        kind: "primary",
        weight: 2,
        label: "MACD 상향 전환",
        detail: "MACD가 시그널선을 상향 돌파. 단기 추세 반전 신호",
      });
    }
    if (histPrev >= 0 && histNow < 0) {
      signals.push({
        id: "macd_bear_cross",
        side: "sell",
        kind: "primary",
        weight: 2,
        label: "MACD 하향 전환",
        detail: "MACD가 시그널선을 하향 이탈. 단기 추세 둔화",
      });
    }
  }

  // --- 볼린저밴드 ---
  const lowerNow = bb[i]?.lower ?? null;
  const lowerPrev = bb[i - 1]?.lower ?? null;
  const upperNow = bb[i]?.upper ?? null;
  if (prev && lowerNow != null && lowerPrev != null && prev.close < lowerPrev && last.close >= lowerNow) {
    signals.push({
      id: "bb_lower_rebound",
      side: "buy",
      kind: "primary",
      weight: 2,
      label: "볼린저 하단 복귀",
      detail: `하단(${fmt(lowerNow, 0)}) 아래로 빠졌다가 밴드 안으로 회복`,
    });
  }
  if (upperNow != null && last.close > upperNow) {
    signals.push({
      id: "bb_upper_break",
      side: "sell",
      kind: "primary",
      weight: 2,
      label: "볼린저 상단 이탈",
      detail: `종가가 상단(${fmt(upperNow, 0)})을 넘음 — 단기 과열`,
    });
  }

  // --- 60일선(중기 추세선) 지지·이탈 ---
  const s60 = snapshot.sma60;
  if (s60 != null && prev) {
    const prev60 = sma60[i - 1];
    const touched = last.low <= s60 * 1.02;
    if (touched && last.close > s60 && prev60 != null && s60 >= prev60) {
      signals.push({
        id: "sma60_support",
        side: "buy",
        kind: "primary",
        weight: 2,
        label: "60일선 지지 반등",
        detail: `상승 중인 60일선(${fmt(s60, 0)})을 찍고 위로 마감`,
      });
    }
    if (prev60 != null && prev.close >= prev60 && last.close < s60) {
      signals.push({
        id: "sma60_break",
        side: "sell",
        kind: "primary",
        weight: 2,
        label: "60일선 이탈",
        detail: `중기 추세선(${fmt(s60, 0)}) 아래로 마감 — 추세 훼손`,
      });
    }
  }

  // --- 추세 필터 ---
  // RSI 과매도만 보고 매수하면 계속 흘러내리는 종목을 잡게 된다("떨어지는 칼날").
  // 반대로 강한 상승 추세의 과매수를 매도로 읽으면 상승장을 놓친다.
  // 그래서 중기 추세(60일선)를 역방향 가중치로 넣어 단독 RSI 신호를 상쇄시킨다.
  if (s60 != null) {
    const s60Ago = sma60[i - 5];
    if (s60Ago != null) {
      if (last.close < s60 * 0.98 && s60 < s60Ago) {
        signals.push({
          id: "downtrend_filter",
          side: "sell",
          kind: "context",
          weight: 2,
          label: "하락추세 지속",
          detail: `하락 중인 60일선(${fmt(s60, 0)}) 아래 — 반등 신호의 신뢰도가 낮습니다`,
        });
      } else if (last.close > s60 * 1.02 && s60 > s60Ago) {
        signals.push({
          id: "uptrend_filter",
          side: "buy",
          kind: "context",
          weight: 2,
          label: "상승추세 지속",
          detail: `상승 중인 60일선(${fmt(s60, 0)}) 위 — 과열 신호를 그대로 매도로 읽지 마세요`,
        });
      }
    }
  }

  // --- 거래량 급증 (방향은 당일 캔들 몸통으로 결정) ---
  const vr = snapshot.volumeRatio;
  if (vr != null && vr >= 2 && last.open > 0) {
    const bodyPct = ((last.close - last.open) / last.open) * 100;
    if (bodyPct >= 2) {
      signals.push({
        id: "volume_surge_up",
        side: "buy",
        kind: "primary",
        weight: 1,
        label: "대량 상승 거래",
        detail: `평균 거래량 ${fmt(vr)}배 + 장대양봉(${fmt(bodyPct)}%)`,
      });
    } else if (bodyPct <= -2) {
      signals.push({
        id: "volume_surge_down",
        side: "sell",
        kind: "primary",
        weight: 1,
        label: "대량 하락 거래",
        detail: `평균 거래량 ${fmt(vr)}배 + 장대음봉(${fmt(bodyPct)}%)`,
      });
    }
  }

  const buyScore = signals.filter((s) => s.side === "buy").reduce((a, s) => a + s.weight, 0);
  const sellScore = signals.filter((s) => s.side === "sell").reduce((a, s) => a + s.weight, 0);
  const netScore = buyScore - sellScore;

  // 배경(context)만으로는 알림을 울리지 않는다.
  // "60일선 아래에 있다"는 상태는 몇 주씩 지속되는데, 그걸 매도 신호로 삼으면
  // 매매 포인트가 아니라 현재 상태를 알리는 꼴이 된다.
  let verdict = verdictOf(netScore);
  const hasPrimary = (side: "buy" | "sell") =>
    signals.some((s) => s.kind === "primary" && s.side === side);
  if (netScore > 0 && !hasPrimary("buy")) verdict = "HOLD";
  if (netScore < 0 && !hasPrimary("sell")) verdict = "HOLD";

  return {
    verdict,
    buyScore,
    sellScore,
    netScore,
    signals,
    snapshot,
    insufficientData: false,
  };
}
