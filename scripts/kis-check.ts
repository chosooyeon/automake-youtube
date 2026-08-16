/**
 * KIS 연결 테스트 — 모의투자 앱키/계좌번호가 살아있는지만 확인한다.
 *
 * 조회만 한다. 주문은 절대 내지 않는다.
 *   ① POST /oauth2/tokenP              → access_token 나오면 앱키 정상
 *   ② GET  .../inquire-balance         → 잔고 뜨면 계좌번호 정상
 *
 * 실행:
 *   cd admin && npx tsx ../scripts/kis-check.ts
 *   cd admin && npx tsx ../scripts/kis-check.ts --fresh   # 캐시 무시하고 토큰 재발급
 *
 * 토큰은 24시간짜리인데 발급 호출에 분당 제한이 있다.
 * 그래서 admin/data/stock/kis-token.json 에 캐싱하고 만료 10분 전까지 재사용한다.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// cwd 가 admin/ 이든 저장소 루트든 같게 동작하도록 이 파일 위치 기준으로 잡는다
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_CACHE = path.join(REPO_ROOT, "admin/data/stock/kis-token.json");

// 모의투자 전용 도메인. 실전(openapi...:9443)과 앱키가 호환되지 않는다
const PAPER_HOST = "https://openapivts.koreainvestment.com:29443";
const TR_BALANCE_PAPER = "VTTC8434R"; // 주식잔고조회(모의). 실전은 TTTC8434R

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 값은 절대 그대로 찍지 않는다 */
function mask(v: string): string {
  if (v.length <= 8) return `${v.slice(0, 2)}${"*".repeat(Math.max(0, v.length - 2))}`;
  return `${v.slice(0, 4)}${"*".repeat(v.length - 8)}${v.slice(-4)}`;
}

function loadEnv(): void {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    console.error(`✗ .env 가 없습니다: ${envPath}`);
    process.exit(1);
  }
  process.loadEnvFile(envPath); // Node 20.12+ 내장. dotenv 의존성 불필요
}

type Creds = { appKey: string; appSecret: string; cano: string; prdt: string };

function readCreds(): Creds {
  const need = [
    "KIS_PAPER_APP_KEY",
    "KIS_PAPER_APP_SECRET",
    "KIS_PAPER_ACCOUNT",
    "KIS_PAPER_ACCOUNT_PRODUCT",
  ] as const;

  const missing: string[] = [];
  for (const k of need) {
    const v = process.env[k]?.trim();
    // .env.example 의 placeholder 가 그대로 남아있는 것도 미기입으로 본다
    if (!v || v.startsWith("your-") || v.startsWith("PS...")) missing.push(k);
  }
  if (missing.length) {
    console.error(`✗ .env 에 아직 안 채워진 값: ${missing.join(", ")}`);
    process.exit(1);
  }

  // .env 를 고치기 전에 계좌번호 후보를 바로 시험해보기 위한 임시 덮어쓰기
  const cano = (arg("account") ?? process.env.KIS_PAPER_ACCOUNT!).trim();
  const prdt = (arg("product") ?? process.env.KIS_PAPER_ACCOUNT_PRODUCT!).trim();
  if (arg("account") || arg("product")) console.log("  (--account/--product 로 덮어쓴 값으로 시험합니다)");

  console.log("환경변수");
  console.log(`  APP_KEY        ${mask(process.env.KIS_PAPER_APP_KEY!.trim())}`);
  console.log(`  APP_SECRET     ${mask(process.env.KIS_PAPER_APP_SECRET!.trim())}`);
  console.log(`  ACCOUNT(CANO)  ${cano.slice(0, 2)}${"*".repeat(Math.max(0, cano.length - 4))}${cano.slice(-2)}  (${cano.length}자리)`);
  console.log(`  PRODUCT(PRDT)  ${prdt}`);

  // 계좌 10자리를 8+2 로 쪼갠 게 맞는지 형식만 미리 잡아준다.
  // 서버에 물어보기 전에 여기서 걸러야 원인이 오타인지 권한인지 헷갈리지 않는다
  const bad = [...cano].filter((ch) => ch < "0" || ch > "9");
  if (bad.length) {
    console.log(`  ✗ CANO 에 숫자가 아닌 문자가 있습니다: ${bad.map((c) => `'${c}'`).join(", ")}`);
    console.log(`     계좌번호는 숫자만 들어갑니다. .env 의 KIS_PAPER_ACCOUNT 를 다시 확인하세요`);
    process.exit(1);
  }
  if (cano.length !== 8) {
    console.log(`  ⚠ CANO 는 8자리여야 합니다. 계좌번호 10자리 중 앞 8자리만 넣으세요`);
  }
  if (!/^\d{2}$/.test(prdt)) {
    console.log(`  ⚠ PRDT 는 숫자 2자리여야 합니다 (종합위탁 = 01)`);
  }

  return {
    appKey: process.env.KIS_PAPER_APP_KEY!.trim(),
    appSecret: process.env.KIS_PAPER_APP_SECRET!.trim(),
    cano,
    prdt,
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
      // 만료 10분 전까지만 재사용
      if (cached.expires_at - Date.now() > 10 * 60 * 1000) {
        const left = Math.round((cached.expires_at - Date.now()) / 60000);
        console.log(`\n① 토큰   캐시 재사용 (${left}분 남음)`);
        return cached.access_token;
      }
    } catch {
      /* 캐시가 깨졌으면 그냥 새로 받는다 */
    }
  }

  const res = await fetch(`${PAPER_HOST}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: c.appKey,
      appsecret: c.appSecret,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`\n① 토큰   ✗ 실패 (HTTP ${res.status})`);
    console.error(`  ${body.slice(0, 300)}`);
    if (body.includes("EGW00133")) {
      console.error("  → 1분당 1회 발급 제한입니다. 1분 뒤 다시 실행하세요");
    } else {
      console.error("  → APP KEY/SECRET 오타이거나 실전용 키를 넣었을 가능성이 큽니다");
      console.error("     (모의용과 실전용은 앱키가 별개입니다)");
    }
    process.exit(1);
  }

  const json = JSON.parse(body) as { access_token: string; expires_in: number };
  const expiresAt = Date.now() + json.expires_in * 1000;

  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(
    TOKEN_CACHE,
    JSON.stringify({ access_token: json.access_token, expires_at: expiresAt }, null, 2)
  );

  const hours = Math.round(json.expires_in / 3600);
  console.log(`\n① 토큰   ✓ 발급 성공 (유효 ${hours}시간, ${path.relative(REPO_ROOT, TOKEN_CACHE)} 에 캐시)`);
  return json.access_token;
}

// ── ② 잔고 조회 ────────────────────────────────────────────────
async function checkBalance(c: Creds, token: string): Promise<boolean> {
  const params = new URLSearchParams({
    CANO: c.cano,
    ACNT_PRDT_CD: c.prdt,
    AFHR_FLPR_YN: "N", // 시간외단일가 반영 안 함
    OFL_YN: "",
    INQR_DVSN: "02", // 종목별
    UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N",
    FNCG_AMT_AUTO_RDPT_YN: "N",
    PRCS_DVSN: "00",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  });

  const res = await fetch(
    `${PAPER_HOST}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: c.appKey,
        appsecret: c.appSecret,
        tr_id: TR_BALANCE_PAPER,
        custtype: "P", // 개인
      },
    }
  );

  const body = await res.text();
  if (!res.ok) {
    console.error(`\n② 잔고   ✗ 실패 (HTTP ${res.status})`);
    console.error(`  ${body.slice(0, 300)}`);
    return false;
  }

  const json = JSON.parse(body) as {
    rt_cd: string;
    msg1?: string;
    output1?: Array<{ prdt_name: string; hldg_qty: string; evlu_amt: string; evlu_pfls_rt: string }>;
    output2?: Array<{ dnca_tot_amt: string; tot_evlu_amt: string; nass_amt: string }>;
  };

  if (json.rt_cd !== "0") {
    console.error(`\n② 잔고   ✗ 거부 (rt_cd=${json.rt_cd}) ${json.msg1 ?? ""}`);
    console.error("  → 계좌번호(CANO/PRDT)가 이 앱키에 연결된 모의계좌가 맞는지 확인하세요");
    return false;
  }

  const sum = json.output2?.[0];
  const won = (v?: string) => Number(v ?? 0).toLocaleString("ko-KR");

  console.log(`\n② 잔고   ✓ 조회 성공`);
  console.log(`  예수금총액   ${won(sum?.dnca_tot_amt)} 원`);
  console.log(`  총평가금액   ${won(sum?.tot_evlu_amt)} 원`);
  console.log(`  순자산       ${won(sum?.nass_amt)} 원`);

  const holdings = (json.output1 ?? []).filter((h) => Number(h.hldg_qty) > 0);
  if (holdings.length) {
    console.log(`  보유종목 ${holdings.length}개`);
    for (const h of holdings) {
      console.log(`    ${h.prdt_name}  ${h.hldg_qty}주  ${won(h.evlu_amt)}원 (${h.evlu_pfls_rt}%)`);
    }
  } else {
    console.log(`  보유종목     없음`);
  }
  return true;
}

async function main(): Promise<void> {
  console.log("KIS 모의투자 연결 테스트 (조회만 — 주문 안 나감)\n");
  loadEnv();
  const creds = readCreds();
  const token = await getToken(creds);
  const ok = await checkBalance(creds, token);

  if (ok) {
    console.log("\n✓ 모의계좌 연결 정상. 2단계(모의 주문) 붙일 수 있습니다.");
  } else {
    console.log("\n✗ 앱키는 유효하지만 계좌 조회가 안 됩니다. 위 메시지를 확인하세요.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n✗ 예외:", e instanceof Error ? e.message : e);
  process.exit(1);
});
