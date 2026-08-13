/**
 * 기술적 지표 계산 (외부 의존성 없음).
 *
 * 모든 함수는 종가 배열(과거→최신)을 받아 같은 길이의 배열을 돌려준다.
 * 계산에 필요한 기간이 안 찬 구간은 null 이다 — 호출부에서 null 체크로 "데이터 부족"을 판정한다.
 */

/** 단순이동평균 */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** 지수이동평균 (첫 값은 SMA 로 시드) */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI (Wilder 평활) */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  hist: number | null;
}

/** MACD (12, 26, 9) */
export function macd(
  values: number[],
  fastP = 12,
  slowP = 26,
  signalP = 9
): MacdPoint[] {
  const fast = ema(values, fastP);
  const slow = ema(values, slowP);

  const line: (number | null)[] = values.map((_, i) =>
    fast[i] != null && slow[i] != null ? (fast[i] as number) - (slow[i] as number) : null
  );

  // signal 은 macd 라인이 존재하는 구간에만 EMA 를 걸고 원래 인덱스로 되돌린다
  const firstIdx = line.findIndex((v) => v != null);
  const out: MacdPoint[] = values.map(() => ({ macd: null, signal: null, hist: null }));
  if (firstIdx < 0) return out;

  const compact = line.slice(firstIdx) as number[];
  const sig = ema(compact, signalP);

  for (let i = 0; i < compact.length; i++) {
    const idx = firstIdx + i;
    const m = compact[i];
    const s = sig[i];
    out[idx] = { macd: m, signal: s, hist: s == null ? null : m - s };
  }
  return out;
}

export interface BollingerPoint {
  mid: number | null;
  upper: number | null;
  lower: number | null;
  /** 밴드폭 / 중심선 — 변동성 수축(스퀴즈) 판정용 */
  width: number | null;
}

/** 볼린저밴드 (20, 2σ · 모집단 표준편차) */
export function bollinger(values: number[], period = 20, mult = 2): BollingerPoint[] {
  const mids = sma(values, period);
  return values.map((_, i) => {
    const mid = mids[i];
    if (mid == null) return { mid: null, upper: null, lower: null, width: null };
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j] - mid) ** 2;
    const sd = Math.sqrt(acc / period);
    const upper = mid + sd * mult;
    const lower = mid - sd * mult;
    return { mid, upper, lower, width: mid === 0 ? null : ((upper - lower) / mid) * 100 };
  });
}
