/**
 * 백테스트 유니버스 — 네이버 랭킹에서 종목 풀을 뽑는다.
 *
 * **관심종목(watchlist)과 일부러 분리했다.** 관심종목은 텔레그램 알림 대상이라
 * 100개로 불리면 알림이 못 쓰게 시끄러워진다. 백테스트에 필요한 건 "표본"이지
 * "지켜볼 종목"이 아니므로 다른 통로로 가져온다.
 *
 * ⚠ 이 목록은 **오늘 기준 스냅샷**이다. 오늘 시총·거래대금이 큰 종목으로
 * 과거를 백테스트하면 그 자체가 선택 편향이다 (그 사이 망한 종목은 목록에 없고,
 * 크게 오른 종목은 반드시 들어 있다). 결과를 실제보다 좋게 만든다 —
 * 이 한계를 지운 채로 숫자를 읽으면 안 된다.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../paths";
import type { StockRef } from "./naver";

export type UniverseKind = "marketCap" | "tradingValue";

export const UNIVERSE_LABEL: Record<UniverseKind, string> = {
  marketCap: "시가총액 상위",
  tradingValue: "거래대금 상위",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CACHE_DIR = path.join(REPO_ROOT, ".cache", "stock");
/** 랭킹은 하루 단위로만 의미가 있다. 12시간이면 같은 날 재실행은 캐시를 탄다 */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface RankedStock {
  code: string;
  name: string;
  exchange: "KOSPI" | "KOSDAQ";
  marketValue: number;
  tradingValue: number;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/**
 * 백테스트에 부적합한 종목을 걷어낸다.
 * - 우선주: 본주와 거의 같이 움직이는데 거래가 얇아 슬리피지 가정이 깨진다
 * - 스팩: 합병 전까지 가격이 고정에 가까워 지표가 무의미하다
 * - ETF/ETN: 개별주와 성격이 달라 같은 규칙으로 묶으면 진단이 흐려진다
 *   (자산군별로 보고 싶으면 config/stock-groups.json 쪽을 쓴다)
 */
function isTradableCommonStock(s: { stockEndType?: string; stockName: string }): boolean {
  if (s.stockEndType && s.stockEndType !== "stock") return false;
  const n = s.stockName;
  if (/우$|우B$|[0-9]우$/.test(n)) return false;
  if (n.includes("스팩")) return false;
  return true;
}

async function fetchPage(exchange: "KOSPI" | "KOSDAQ", page: number, pageSize: number): Promise<RankedStock[]> {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${exchange}?page=${page}&pageSize=${pageSize}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { stocks?: any[] };
    return (j.stocks ?? []).filter(isTradableCommonStock).map((s) => ({
      code: String(s.itemCode),
      name: String(s.stockName),
      exchange,
      marketValue: num(s.marketValue),
      tradingValue: num(s.accumulatedTradingValue),
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 후보 풀을 만든다. 네이버는 시총 순 목록만 페이지로 주므로, 거래대금 상위도
 * **넓은 시총 풀을 받아 거래대금으로 재정렬**해서 구한다.
 * 거래대금 상위 100은 사실상 시총 상위 400 안에 들어오므로 실용적으로 충분하다
 * (테마 급등주는 빠질 수 있는데, 어차피 그런 종목은 백테스트 대상으로 부적합하다).
 */
async function fetchPool(poolSize = 400): Promise<RankedStock[]> {
  const cacheFile = path.join(CACHE_DIR, `pool-${poolSize}.json`);
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(fs.readFileSync(cacheFile, "utf8")) as RankedStock[];
    }
  } catch {
    /* 캐시 없음 — 그냥 받는다 */
  }

  const perExchange = Math.ceil(poolSize / 2);
  const pageSize = 100;
  const out: RankedStock[] = [];

  for (const exchange of ["KOSPI", "KOSDAQ"] as const) {
    for (let page = 1; (page - 1) * pageSize < perExchange; page++) {
      const rows = await fetchPage(exchange, page, pageSize);
      if (rows.length === 0) break;
      out.push(...rows);
      await new Promise((r) => setTimeout(r, 200)); // 비공식 API 예의상 간격
    }
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(out), "utf8");
  return out;
}

/** 상위 N 종목을 StockRef 로 돌려준다 */
export async function fetchUniverse(kind: UniverseKind, top: number): Promise<StockRef[]> {
  const pool = await fetchPool(Math.max(400, top * 4));
  const key = kind === "marketCap" ? "marketValue" : "tradingValue";
  const sorted = [...pool].sort((a, b) => b[key] - a[key]);

  // 같은 종목이 두 거래소에 중복으로 잡히는 일은 없지만, 방어적으로 코드 기준 중복 제거
  const seen = new Set<string>();
  const picked: RankedStock[] = [];
  for (const s of sorted) {
    if (seen.has(s.code)) continue;
    seen.add(s.code);
    picked.push(s);
    if (picked.length >= top) break;
  }

  return picked.map((s) => ({
    symbol: s.code,
    code: s.code,
    name: s.name,
    market: "KR" as const,
    exchange: s.exchange,
  }));
}
