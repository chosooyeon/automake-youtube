/**
 * 토스증권 Open API 연결 테스트 — client_id/secret 이 살아있는지만 확인한다.
 *
 * ⚠ 토스는 모의투자 샌드박스가 없다. 이건 실계좌다.
 *   그래서 이 스크립트는 조회 엔드포인트만 호출한다. 주문 API 는 아예 부르지 않는다.
 *
 *   ① POST /oauth2/token          → access_token 나오면 client_id/secret 정상
 *   ② GET  /api/v1/accounts       → 계좌 목록. 계좌 헤더가 필요 없는 유일한 계좌 API
 *   ③ GET  /api/v1/buying-power   → accountSeq 로 매수가능금액 (X-Tossinvest-Account 검증)
 *   ④ GET  /api/v1/holdings       → 보유 종목
 *
 * 실행:
 *   cd admin && npx tsx ../scripts/toss-check.ts
 *   cd admin && npx tsx ../scripts/toss-check.ts --fresh   # 캐시 무시하고 토큰 재발급
 *
 * TOSS_ACCOUNT 는 없어도 된다 — ②가 accountSeq 를 알려준다.
 * 값이 있으면 ②의 목록과 대조해서 맞는지까지 확인한다.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_CACHE = path.join(REPO_ROOT, "admin/data/stock/toss-token.json");
const HOST = "https://openapi.tossinvest.com";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function mask(v: string): string {
  if (v.length <= 8) return `${v.slice(0, 2)}${"*".repeat(Math.max(0, v.length - 2))}`;
  return `${v.slice(0, 4)}${"*".repeat(v.length - 8)}${v.slice(-4)}`;
}
function won(v: unknown): string {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? n.toLocaleString("ko-KR") : String(v ?? "-");
}

function loadEnv(): void {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    console.error(`✗ .env 가 없습니다: ${envPath}`);
    process.exit(1);
  }
  process.loadEnvFile(envPath);
}

type Creds = { clientId: string; clientSecret: string; account?: string };

function readCreds(): Creds {
  const missing: string[] = [];
  for (const k of ["TOSS_CLIENT_ID", "TOSS_CLIENT_SECRET"] as const) {
    const v = process.env[k]?.trim();
    if (!v || v.startsWith("your-")) missing.push(k);
  }
  if (missing.length) {
    console.error(`✗ .env 에 아직 안 채워진 값: ${missing.join(", ")}`);
    console.error("  토스증권 PC 웹(WTS) → 설정 → Open API 에서 발급받으세요");
    process.exit(1);
  }

  const account = process.env.TOSS_ACCOUNT?.trim() || undefined;

  console.log("환경변수");
  console.log(`  CLIENT_ID      ${mask(process.env.TOSS_CLIENT_ID!.trim())}`);
  console.log(`  CLIENT_SECRET  ${mask(process.env.TOSS_CLIENT_SECRET!.trim())}`);
  console.log(`  ACCOUNT        ${account ? mask(account) : "(비어있음 — 없어도 됩니다)"}`);

  return {
    clientId: process.env.TOSS_CLIENT_ID!.trim(),
    clientSecret: process.env.TOSS_CLIENT_SECRET!.trim(),
    account,
  };
}

// ── ① 토큰 발급 ────────────────────────────────────────────────
async function getToken(c: Creds): Promise<string> {
  if (!flag("fresh") && fs.existsSync(TOKEN_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf-8")) as {
        access_token: string;
        expires_at: number;
      };
      if (cached.expires_at - Date.now() > 5 * 60 * 1000) {
        const left = Math.round((cached.expires_at - Date.now()) / 60000);
        console.log(`\n① 토큰   캐시 재사용 (${left}분 남음)`);
        return cached.access_token;
      }
    } catch {
      /* 캐시가 깨졌으면 새로 받는다 */
    }
  }

  // 스펙상 form-urlencoded 바디에 client_id/client_secret 을 담는다 (Basic 인증 아님)
  const res = await fetch(`${HOST}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`\n① 토큰   ✗ 실패 (HTTP ${res.status})`);
    console.error(`  ${body.slice(0, 300)}`);
    console.error("  → CLIENT_ID/SECRET 오타이거나, WTS 에서 API 사용이 아직 활성화되지 않았을 수 있습니다");
    process.exit(1);
  }

  const json = JSON.parse(body) as { access_token: string; expires_in: number };
  const expiresAt = Date.now() + json.expires_in * 1000;
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(
    TOKEN_CACHE,
    JSON.stringify({ access_token: json.access_token, expires_at: expiresAt }, null, 2)
  );
  console.log(`\n① 토큰   ✓ 발급 성공 (유효 ${Math.round(json.expires_in / 60)}분)`);
  return json.access_token;
}

/** 조회 전용 GET. 이 스크립트는 이 함수로만 API 를 부른다 — 주문이 나갈 경로가 없다 */
async function get(
  token: string,
  urlPath: string,
  opts: { accountSeq?: number; query?: Record<string, string> } = {}
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (opts.accountSeq !== undefined) headers["X-Tossinvest-Account"] = String(opts.accountSeq);

  const res = await fetch(`${HOST}${urlPath}${qs}`, { headers });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 에러 페이지가 HTML 로 올 수도 있다 */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function main(): Promise<void> {
  console.log("토스증권 Open API 연결 테스트");
  console.log("⚠ 토스는 모의계좌가 없습니다 — 실계좌입니다. 이 스크립트는 조회만 합니다\n");

  loadEnv();
  const creds = readCreds();
  const token = await getToken(creds);

  // ── ② 계좌 목록 (X-Tossinvest-Account 없이 호출되는 유일한 계좌 API)
  const accRes = await get(token, "/api/v1/accounts");
  if (!accRes.ok) {
    console.error(`\n② 계좌   ✗ 실패 (HTTP ${accRes.status})`);
    console.error(`  ${accRes.text.slice(0, 300)}`);
    process.exit(1);
  }
  const accounts = (accRes.json?.result ?? []) as Array<{
    accountNo: string;
    accountSeq: number;
    accountType?: string;
  }>;

  if (!accounts.length) {
    console.error("\n② 계좌   ✗ 연결된 계좌가 없습니다");
    console.error("  → 토스증권 계좌 개설 후 WTS 에서 Open API 를 다시 발급하세요");
    process.exit(1);
  }

  console.log(`\n② 계좌   ✓ ${accounts.length}개 조회됨`);
  for (const a of accounts) {
    console.log(`  accountNo ${mask(a.accountNo)}  accountSeq ${a.accountSeq}  ${a.accountType ?? ""}`);
  }

  // .env 의 TOSS_ACCOUNT 가 실제 계좌와 맞는지 대조
  const target = accounts[0];
  if (creds.account) {
    const hit = accounts.find(
      (a) => String(a.accountSeq) === creds.account || a.accountNo.replace(/\D/g, "") === creds.account!.replace(/\D/g, "")
    );
    if (hit) {
      console.log(`  ✓ .env 의 TOSS_ACCOUNT 가 위 목록과 일치합니다`);
    } else {
      console.log(`  ⚠ .env 의 TOSS_ACCOUNT 가 위 목록에 없습니다`);
      console.log(`     헤더에 쓰는 값은 계좌번호가 아니라 accountSeq(${target.accountSeq}) 입니다`);
    }
  } else {
    console.log(`  → .env 에 넣을 값: TOSS_ACCOUNT=${target.accountSeq}  (accountSeq)`);
  }

  // ── ③ 매수가능금액 (X-Tossinvest-Account 헤더가 실제로 먹는지 확인)
  const bp = await get(token, "/api/v1/buying-power", {
    accountSeq: target.accountSeq,
    query: { currency: "KRW" },
  });
  if (bp.ok) {
    console.log(`\n③ 잔고   ✓ 조회 성공`);
    console.log(`  현금매수가능  ${won(bp.json?.result?.cashBuyingPower)} 원`);
  } else {
    console.log(`\n③ 잔고   ✗ 실패 (HTTP ${bp.status}) ${bp.text.slice(0, 200)}`);
  }

  // ── ④ 보유 종목
  const hold = await get(token, "/api/v1/holdings", { accountSeq: target.accountSeq });
  if (hold.ok) {
    const items = (hold.json?.result?.items ?? []) as Array<Record<string, any>>;
    console.log(`\n④ 보유   ✓ 조회 성공 — ${items.length ? `${items.length}종목` : "보유 없음"}`);
    for (const it of items.slice(0, 10)) {
      console.log(`    ${it.symbol ?? it.name ?? "?"}  ${it.quantity ?? "?"}주`);
    }
  } else {
    console.log(`\n④ 보유   ✗ 실패 (HTTP ${hold.status}) ${hold.text.slice(0, 200)}`);
  }

  if (bp.ok && hold.ok) {
    console.log("\n✓ 토스 연결 정상 (조회 기준). 주문은 실계좌로 나가므로 별도 승인 게이트가 필요합니다.");
  } else {
    console.log("\n△ 토큰·계좌목록은 정상인데 계좌 상세 조회가 막혔습니다. 위 메시지를 확인하세요.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n✗ 예외:", e instanceof Error ? e.message : e);
  process.exit(1);
});
