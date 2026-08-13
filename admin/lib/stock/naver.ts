/**
 * 네이버 금융 비공식 API 클라이언트 (국내 + 미국 주식).
 *
 * 왜 네이버인가: Yahoo Finance(query1/query2)는 429로 막히고 Stooq는 JS 챌린지를 건다.
 * 네이버는 API 키 없이 국내·해외 일봉과 실시간 시세를 모두 돌려준다 (2026-08 확인).
 * 비공식이므로 스키마가 바뀔 수 있다 → 파싱 실패는 종목 1개만 버리고 전체는 살린다.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type Market = "KR" | "US";

export interface StockRef {
  /** 네이버 조회키. KR="005930", US="NVDA.O" (reutersCode) */
  symbol: string;
  /** 사람이 읽는 티커. KR="005930", US="NVDA" */
  code: string;
  name: string;
  market: Market;
  /** KOSPI / KOSDAQ / NASDAQ / NYSE ... */
  exchange: string;
}

export interface Candle {
  /** YYYYMMDD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  price: number;
  /** 전일 대비 등락액 (부호 포함) */
  change: number;
  /** 전일 대비 등락률 % (부호 포함) */
  changePct: number;
  currency: string;
  /** OPEN / CLOSE 등 네이버 marketStatus 원문 */
  marketStatus: string;
  /** 마지막 체결 시각 ISO */
  tradedAt: string | null;
}

async function getJson(url: string, timeoutMs = 9000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    const err = e as Error;
    throw new Error(err?.name === "AbortError" ? "timeout" : err?.message || "fetch failed");
  } finally {
    clearTimeout(timer);
  }
}

/** "255,500" → 255500 / 이미 number 면 그대로 */
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return NaN;
}

/** 네이버 등락 코드: 1=상한 2=상승 3=보합 4=하한 5=하락 */
function signOf(code: string | undefined): number {
  return code === "4" || code === "5" ? -1 : 1;
}

function yyyymmdd(d: Date): string {
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

/**
 * 종목 자동완성 검색. 국내(KOR)·미국(USA) 종목만 남긴다.
 * ex) "삼성전자" → 005930, "tsla" → TSLA.O
 */
export async function searchStocks(query: string, limit = 8): Promise<StockRef[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock,index`;
  const j = await getJson(url);
  const items: any[] = Array.isArray(j?.items) ? j.items : [];

  const out: StockRef[] = [];
  for (const it of items) {
    const nation = String(it?.nationCode || "");
    if (nation !== "KOR" && nation !== "USA") continue; // 일본·중국 등은 통화/장시간이 달라 제외
    const market: Market = nation === "KOR" ? "KR" : "US";
    const symbol = String(it?.reutersCode || it?.code || "");
    if (!symbol) continue;
    out.push({
      symbol,
      code: String(it?.code || symbol),
      name: String(it?.name || symbol),
      market,
      exchange: String(it?.typeCode || ""),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 일봉 조회. 지표 계산에 SMA60·볼린저20이 필요하므로 기본 200일치를 끌어온다.
 * 반환은 과거→최신 오름차순.
 */
export async function fetchCandles(ref: StockRef, days = 200): Promise<Candle[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const range = `startDateTime=${yyyymmdd(start)}0000&endDateTime=${yyyymmdd(end)}0000`;
  const kind = ref.market === "KR" ? "domestic" : "foreign";
  const url = `https://api.stock.naver.com/chart/${kind}/item/${encodeURIComponent(
    ref.symbol
  )}/day?${range}`;

  const rows: any[] = await getJson(url, 12000);
  if (!Array.isArray(rows)) throw new Error("차트 응답 형식 오류");

  const candles: Candle[] = [];
  for (const r of rows) {
    const c: Candle = {
      date: String(r?.localDate || ""),
      open: num(r?.openPrice),
      high: num(r?.highPrice),
      low: num(r?.lowPrice),
      close: num(r?.closePrice),
      volume: num(r?.accumulatedTradingVolume),
    };
    // 휴장일·결측 캔들은 지표를 오염시키므로 버린다
    if (!c.date || !Number.isFinite(c.close) || c.close <= 0) continue;
    candles.push(c);
  }
  candles.sort((a, b) => a.date.localeCompare(b.date));
  return candles;
}

/** 실시간(국내 지연 없음 / 미국 실시간) 시세. 실패 시 null → 호출부가 마지막 종가로 대체한다. */
export async function fetchQuote(ref: StockRef): Promise<Quote | null> {
  const kind = ref.market === "KR" ? "domestic" : "worldstock";
  const url = `https://polling.finance.naver.com/api/realtime/${kind}/stock/${encodeURIComponent(
    ref.symbol
  )}`;
  try {
    const j = await getJson(url);
    const d = j?.datas?.[0];
    if (!d) return null;

    const price = num(d.closePriceRaw ?? d.closePrice);
    if (!Number.isFinite(price)) return null;

    const sign = signOf(d?.compareToPreviousPrice?.code);
    const change = Math.abs(num(d.compareToPreviousClosePriceRaw ?? d.compareToPreviousClosePrice)) * sign;
    const changePct = Math.abs(num(d.fluctuationsRatioRaw ?? d.fluctuationsRatio)) * sign;

    return {
      price,
      change: Number.isFinite(change) ? change : 0,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      currency: String(d?.currencyType?.code || (ref.market === "KR" ? "KRW" : "USD")),
      marketStatus: String(d?.marketStatus || ""),
      tradedAt: d?.localTradedAt ? String(d.localTradedAt) : null,
    };
  } catch {
    return null;
  }
}

/** 네이버 종목 페이지 URL (알림 메시지에 첨부) */
export function stockUrl(ref: StockRef): string {
  return ref.market === "KR"
    ? `https://m.stock.naver.com/domestic/stock/${ref.code}/total`
    : `https://m.stock.naver.com/worldstock/stock/${ref.symbol}/total`;
}
