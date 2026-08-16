/**
 * 토스증권 Open API 클라이언트 — **조회 전용**.
 *
 * ⚠ 토스는 모의투자 샌드박스가 없다. 여기서 나가는 요청은 전부 실계좌를 향한다.
 *
 * 그래서 이 모듈에는 주문 함수가 아예 없다. 있는 건 `get()` 하나뿐이고,
 * `POST /api/v1/orders` 를 부를 코드 경로가 존재하지 않는다.
 * 나중에 주문을 붙이더라도 반드시 `assertTradingAllowed()` 를 먼저 통과시켜라 —
 * 기본값이 차단이고, 사람이 .env 를 직접 고쳐야만 열린다.
 *
 * 관련 문서: docs/STOCK-TRADING.md
 */

import fs from "node:fs";
import path from "node:path";
import { getEnv } from "../env";
import { STOCK_DATA_DIR } from "./store";

const HOST = "https://openapi.tossinvest.com";
const TOKEN_CACHE = path.join(STOCK_DATA_DIR, "toss-token.json");

/**
 * 매매 차단 스위치.
 *
 * 기본값이 "차단"이다. 열려면 .env 에 TOSS_TRADING_ENABLED=true 를 사람이 직접 넣어야 한다.
 * 환경변수 하나로 막는 이유: 코드를 실수로 고쳐도, 봇이 스스로 고쳐도 .env 는 커밋되지 않으므로
 * CI·다른 세션에서는 절대 열리지 않는다.
 */
export function isTradingAllowed(): boolean {
  return (getEnv("TOSS_TRADING_ENABLED") || "").toLowerCase() === "true";
}

/** 주문 성격의 코드는 무조건 이 함수를 먼저 통과해야 한다 */
export function assertTradingAllowed(action: string): void {
  if (!isTradingAllowed()) {
    throw new Error(
      `[토스 매매 차단] "${action}" 이(가) 거부되었습니다.\n` +
        `토스는 실계좌입니다. 사용자가 직접 .env 에 TOSS_TRADING_ENABLED=true 를 넣기 전까지 주문은 나가지 않습니다.`
    );
  }
}

export interface TossAccount {
  accountNo: string;
  accountSeq: number;
  accountType?: string;
}

export interface TossHolding {
  symbol: string;
  name: string;
  currency: string;
  marketCountry?: string;
  /** 소수점 주식이 있으므로 숫자로 다룬다 */
  quantity: number;
  lastPrice: number;
  averagePurchasePrice: number;
}

// ---------- 인증 ----------

interface CachedToken {
  access_token: string;
  expires_at: number;
}

async function getToken(): Promise<string> {
  if (fs.existsSync(TOKEN_CACHE)) {
    try {
      const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf8")) as CachedToken;
      if (c.expires_at - Date.now() > 5 * 60 * 1000) return c.access_token;
    } catch {
      /* 캐시가 깨졌으면 새로 받는다 */
    }
  }

  const clientId = getEnv("TOSS_CLIENT_ID");
  const clientSecret = getEnv("TOSS_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(".env 에 TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 이 없습니다");
  }

  const res = await fetch(`${HOST}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`토스 토큰 발급 실패 (HTTP ${res.status}) ${await res.text()}`);

  const json = (await res.json()) as { access_token: string; expires_in: number };
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(
    TOKEN_CACHE,
    JSON.stringify({ access_token: json.access_token, expires_at: Date.now() + json.expires_in * 1000 }, null, 2)
  );
  return json.access_token;
}

/**
 * GET 전용. 이 모듈에서 네트워크로 나가는 유일한 통로다.
 * method 를 인자로 받지 않는 것 자체가 안전장치다 — 여기로는 주문을 낼 수 없다.
 */
async function get<T>(urlPath: string, opts: { accountSeq?: number; query?: Record<string, string> } = {}): Promise<T> {
  const token = await getToken();
  const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (opts.accountSeq !== undefined) headers["X-Tossinvest-Account"] = String(opts.accountSeq);

  const res = await fetch(`${HOST}${urlPath}${qs}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`토스 ${urlPath} 실패 (HTTP ${res.status}) ${text.slice(0, 200)}`);
  return JSON.parse(text).result as T;
}

// ---------- 조회 ----------

export async function fetchAccounts(): Promise<TossAccount[]> {
  return (await get<TossAccount[]>("/api/v1/accounts")) ?? [];
}

/** .env 의 TOSS_ACCOUNT(=accountSeq) 우선, 없으면 계좌목록의 첫 번째 */
export async function resolveAccountSeq(): Promise<number> {
  const fromEnv = getEnv("TOSS_ACCOUNT");
  if (fromEnv && /^\d+$/.test(fromEnv.trim())) return Number(fromEnv.trim());
  const accounts = await fetchAccounts();
  if (!accounts.length) throw new Error("토스에 연결된 계좌가 없습니다");
  return accounts[0].accountSeq;
}

export async function fetchHoldings(accountSeq: number): Promise<TossHolding[]> {
  const r = await get<{ items?: Array<Record<string, string>> }>("/api/v1/holdings", { accountSeq });
  return (r?.items ?? []).map((it) => ({
    symbol: String(it.symbol),
    name: String(it.name ?? it.symbol),
    currency: String(it.currency ?? ""),
    marketCountry: it.marketCountry ? String(it.marketCountry) : undefined,
    quantity: Number(it.quantity ?? 0),
    lastPrice: Number(it.lastPrice ?? 0),
    averagePurchasePrice: Number(it.averagePurchasePrice ?? 0),
  }));
}

export interface TossFill {
  symbol: string;
  side: string;
  /** 체결 수량. 미체결/취소면 0 */
  filledQuantity: number;
  averageFilledPrice: number;
  /** 체결 시각 (없으면 주문 시각) */
  at: string;
}

/**
 * 체결된 주문 이력. **조회다** — 주문을 내는 게 아니라 지나간 주문을 읽는다.
 * 페이지네이션은 커서로 끝까지 따라간다 (기본 페이지 20, 최대 100).
 */
export async function fetchFills(accountSeq: number, symbol?: string): Promise<TossFill[]> {
  const out: TossFill[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 50; page++) {
    const query: Record<string, string> = { status: "CLOSED", limit: "100" };
    if (symbol) query.symbol = symbol;
    if (cursor) query.cursor = cursor;

    const r: {
      orders?: Array<Record<string, any>>;
      nextCursor?: string | null;
      hasNext?: boolean;
    } = await get("/api/v1/orders", { accountSeq, query });

    for (const o of r?.orders ?? []) {
      const filled = Number(o?.execution?.filledQuantity ?? 0);
      if (!filled) continue; // 취소·미체결은 포지션에 영향이 없다
      out.push({
        symbol: String(o.symbol),
        side: String(o.side),
        filledQuantity: filled,
        averageFilledPrice: Number(o?.execution?.averageFilledPrice ?? o?.price ?? 0),
        at: String(o?.execution?.filledAt ?? o?.orderedAt ?? ""),
      });
    }

    if (!r?.hasNext || !r?.nextCursor) break;
    cursor = r.nextCursor;
  }

  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * 지금 들고 있는 포지션이 언제 시작됐는지 (YYYYMMDD).
 *
 * 체결 이력을 시간순으로 훑으며 수량을 누적하고, **마지막으로 0이 된 다음 첫 매수일**을 잡는다.
 * 중간에 전량 매도했다가 다시 샀으면 그 재매수일이 시작점이다.
 * 이 날짜 이전의 매도신호는 "사기도 전에 파는" 계산이 되므로 반드시 잘라내야 한다.
 */
export function positionStartDate(fills: TossFill[]): string | null {
  let qty = 0;
  let start: string | null = null;

  for (const f of fills) {
    const isBuy = f.side.toUpperCase().includes("BUY");
    if (qty <= 1e-9 && isBuy) start = f.at;
    qty += isBuy ? f.filledQuantity : -f.filledQuantity;
    if (qty <= 1e-9) start = null; // 전량 청산 — 다음 매수가 새 시작
  }

  return start ? start.slice(0, 10).replace(/-/g, "") : null;
}

export interface PositionSnapshot {
  /** 그 시점까지 쌓인 보유 수량 */
  quantity: number;
  /** 그 시점까지의 매수 평균단가 */
  avgCost: number;
}

/**
 * **그 날짜 시점의** 포지션. 오늘의 평단·수량을 과거에 소급하면 안 되기 때문에 필요하다.
 *
 * 분할매수로 평단이 올라간 종목은, 오늘 평단으로 과거 손익을 계산하면
 * "그때 팔았으면 크게 손해"라는 가짜 결론이 나온다 — 그 시점엔 평단이 더 낮았고 수량도 적었다.
 * 매도는 평단을 바꾸지 않고 원가를 수량 비율만큼 덜어낸다 (이동평균원가법).
 */
export function positionAt(fills: TossFill[], yyyymmdd: string): PositionSnapshot {
  let qty = 0;
  let cost = 0;

  for (const f of fills) {
    const day = f.at.slice(0, 10).replace(/-/g, "");
    if (day > yyyymmdd) break; // fills 는 시간순 정렬 전제
    if (f.side.toUpperCase().includes("BUY")) {
      cost += f.filledQuantity * f.averageFilledPrice;
      qty += f.filledQuantity;
    } else {
      if (qty > 1e-9) cost *= Math.max(0, qty - f.filledQuantity) / qty;
      qty = Math.max(0, qty - f.filledQuantity);
    }
  }

  return { quantity: qty, avgCost: qty > 1e-9 ? cost / qty : 0 };
}

export async function fetchBuyingPower(accountSeq: number, currency = "KRW"): Promise<number> {
  const r = await get<{ cashBuyingPower?: string }>("/api/v1/buying-power", {
    accountSeq,
    query: { currency },
  });
  return Number(r?.cashBuyingPower ?? 0);
}
