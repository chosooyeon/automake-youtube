/**
 * 한국투자증권(KIS) 클라이언트 — **조회 전용 + 실계좌 이중 차단**.
 *
 * 모드가 세 개다. 기본값은 아무것도 안 하는 `dry` 다.
 *   dry   (기본) 주문 자체가 막힘. 코드를 실수로 돌려도 아무 일도 안 일어난다
 *   paper 모의계좌에 가상 주문. 잃어도 가짜 돈이다
 *   live  실계좌에 진짜 주문 ← **여기만 이중 잠금**
 *
 * live 는 조건 두 개를 **동시에** 만족해야 열린다:
 *   1) STOCK_MODE=live
 *   2) KIS_LIVE_TRADING_ENABLED=true
 * 하나만 켜면 안 열린다. 실수로 STOCK_MODE 를 바꿔도 주문이 나가지 않게 하려는 것이다.
 *
 * 그리고 이 파일에는 주문 함수가 없다. 네트워크 통로가 GET 전용 `get()` 하나뿐이다.
 * 나중에 주문을 붙이면 반드시 `assertTradingAllowed()` 를 먼저 통과시켜라.
 *
 * 관련 문서: docs/STOCK-TRADING.md
 */

import fs from "node:fs";
import path from "node:path";
import { getEnv } from "../env";
import { STOCK_DATA_DIR } from "./store";

export type StockMode = "dry" | "paper" | "live";

const PAPER_HOST = "https://openapivts.koreainvestment.com:29443";
const LIVE_HOST = "https://openapi.koreainvestment.com:9443";

/** 주식잔고조회 tr_id — 모의는 V 로 시작한다 */
const TR_BALANCE = { paper: "VTTC8434R", live: "TTTC8434R" } as const;

/** 기본값은 dry. 오타나 미설정은 전부 dry 로 떨어진다 (안전한 쪽) */
export function resolveMode(): StockMode {
  const raw = (getEnv("STOCK_MODE") || "").trim().toLowerCase();
  return raw === "live" || raw === "paper" ? raw : "dry";
}

/** 실계좌 주문 허용 여부 — 스위치 두 개가 모두 켜져야 true */
export function isLiveAllowed(): boolean {
  return resolveMode() === "live" && (getEnv("KIS_LIVE_TRADING_ENABLED") || "").toLowerCase() === "true";
}

/** 주문 성격의 코드는 무조건 이 함수를 먼저 통과해야 한다 */
export function assertTradingAllowed(action: string): void {
  const mode = resolveMode();

  if (mode === "dry") {
    throw new Error(
      `[KIS 주문 차단] "${action}" 거부 — STOCK_MODE=dry 입니다.\n` +
        `모의주문을 내려면 .env 에 STOCK_MODE=paper 를 넣으세요.`
    );
  }
  if (mode === "live" && !isLiveAllowed()) {
    throw new Error(
      `[KIS 실계좌 차단] "${action}" 거부 — 실제 돈이 나가는 주문입니다.\n` +
        `STOCK_MODE=live 만으로는 열리지 않습니다. KIS_LIVE_TRADING_ENABLED=true 도 사람이 직접 넣어야 합니다.`
    );
  }
}

export interface KisCreds {
  host: string;
  appKey: string;
  appSecret: string;
  cano: string;
  prdt: string;
  isPaper: boolean;
}

/**
 * 모드에 맞는 키를 고른다.
 * dry 는 모의 키를 쓴다 — 조회는 해봐야 하는데 실계좌를 건드릴 이유가 없기 때문이다.
 */
export function loadCreds(): KisCreds {
  const useLive = isLiveAllowed();
  const p = useLive ? "KIS_LIVE" : "KIS_PAPER";

  const appKey = (getEnv(`${p}_APP_KEY`) || "").trim();
  const appSecret = (getEnv(`${p}_APP_SECRET`) || "").trim();
  const cano = (getEnv(`${p}_ACCOUNT`) || "").trim();
  const prdt = (getEnv(`${p}_ACCOUNT_PRODUCT`) || "").trim();

  const missing = [
    ["APP_KEY", appKey],
    ["APP_SECRET", appSecret],
    ["ACCOUNT", cano],
    ["ACCOUNT_PRODUCT", prdt],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => `${p}_${k}`);
  if (missing.length) throw new Error(`.env 에 ${missing.join(", ")} 이(가) 없습니다`);

  const bad = [...cano].filter((ch) => ch < "0" || ch > "9");
  if (bad.length) throw new Error(`${p}_ACCOUNT 에 숫자가 아닌 문자가 있습니다: ${bad.join(", ")}`);
  if (cano.length !== 8) throw new Error(`${p}_ACCOUNT 는 8자리여야 합니다 (지금 ${cano.length}자리)`);

  return { host: useLive ? LIVE_HOST : PAPER_HOST, appKey, appSecret, cano, prdt, isPaper: !useLive };
}

// ---------- 인증 ----------

function tokenCachePath(isPaper: boolean): string {
  return path.join(STOCK_DATA_DIR, isPaper ? "kis-token.json" : "kis-token-live.json");
}

export async function getToken(c: KisCreds): Promise<string> {
  const cache = tokenCachePath(c.isPaper);
  if (fs.existsSync(cache)) {
    try {
      const t = JSON.parse(fs.readFileSync(cache, "utf8")) as { access_token: string; expires_at: number };
      if (t.expires_at - Date.now() > 10 * 60 * 1000) return t.access_token;
    } catch {
      /* 캐시가 깨졌으면 새로 받는다 */
    }
  }

  const res = await fetch(`${c.host}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: c.appKey, appsecret: c.appSecret }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`KIS 토큰 발급 실패 (HTTP ${res.status}) ${text.slice(0, 200)}`);

  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(
    cache,
    JSON.stringify({ access_token: json.access_token, expires_at: Date.now() + json.expires_in * 1000 }, null, 2)
  );
  return json.access_token;
}

/**
 * GET 전용. 이 모듈에서 네트워크로 나가는 유일한 통로다.
 * method 를 인자로 받지 않는 것 자체가 안전장치다 — 여기로는 주문을 낼 수 없다.
 */
async function get<T>(c: KisCreds, urlPath: string, trId: string, query: Record<string, string>): Promise<T> {
  const token = await getToken(c);
  const res = await fetch(`${c.host}${urlPath}?${new URLSearchParams(query)}`, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: c.appKey,
      appsecret: c.appSecret,
      tr_id: trId,
      custtype: "P",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`KIS ${urlPath} 실패 (HTTP ${res.status}) ${text.slice(0, 200)}`);

  const json = JSON.parse(text) as { rt_cd: string; msg1?: string };
  if (json.rt_cd !== "0") throw new Error(`KIS ${urlPath} 거부 (rt_cd=${json.rt_cd}) ${json.msg1 ?? ""}`);
  return json as T;
}

export interface KisBalance {
  /** 예수금총금액 */
  cash: number;
  /** 총평가금액 */
  totalValue: number;
  holdings: Array<{ name: string; code: string; quantity: number; value: number; plPct: number }>;
}

export async function fetchBalance(c: KisCreds): Promise<KisBalance> {
  const r = await get<{
    output1?: Array<Record<string, string>>;
    output2?: Array<Record<string, string>>;
  }>(c, "/uapi/domestic-stock/v1/trading/inquire-balance", c.isPaper ? TR_BALANCE.paper : TR_BALANCE.live, {
    CANO: c.cano,
    ACNT_PRDT_CD: c.prdt,
    AFHR_FLPR_YN: "N",
    OFL_YN: "",
    INQR_DVSN: "02",
    UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N",
    FNCG_AMT_AUTO_RDPT_YN: "N",
    PRCS_DVSN: "00",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  });

  const sum = r.output2?.[0] ?? {};
  return {
    cash: Number(sum.dnca_tot_amt ?? 0),
    totalValue: Number(sum.tot_evlu_amt ?? 0),
    holdings: (r.output1 ?? [])
      .filter((h) => Number(h.hldg_qty ?? 0) > 0)
      .map((h) => ({
        name: String(h.prdt_name ?? ""),
        code: String(h.pdno ?? ""),
        quantity: Number(h.hldg_qty ?? 0),
        value: Number(h.evlu_amt ?? 0),
        plPct: Number(h.evlu_pfls_rt ?? 0),
      })),
  };
}
