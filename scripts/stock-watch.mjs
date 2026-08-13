#!/usr/bin/env node
/**
 * 관심종목 감시 → 매수·매도 신호 발생 시 텔레그램 알림.
 *
 * 판정 로직은 admin 쪽(admin/lib/stock/*)에 한 벌만 두고, 이 스크립트는 그 API 를 부른다.
 * (지표 계산을 두 번 구현하면 반드시 둘이 어긋난다)
 *
 * 사용:
 *   node scripts/stock-watch.mjs                 # 1회 스캔 + 알림
 *   node scripts/stock-watch.mjs --force         # 중복 방지 무시하고 무조건 발송 (테스트)
 *   node scripts/stock-watch.mjs --url http://localhost:3000
 *
 * 전제: admin 대시보드가 떠 있어야 한다 (cd admin && npm run dev, 또는 npm run build && npm start).
 *
 * 주기 실행 등록 (macOS crontab -e) — 평일 한국장 마감 후 / 미국장 마감 후:
 *   45 15 * * 1-5 /usr/local/bin/node ~/Documents/automake-youtube/scripts/stock-watch.mjs >> /tmp/stock-watch.log 2>&1
 *   15  6 * * 2-6 /usr/local/bin/node ~/Documents/automake-youtube/scripts/stock-watch.mjs >> /tmp/stock-watch.log 2>&1
 *   (node 경로는 `which node` 로 확인해서 넣을 것. cron 은 PATH 가 거의 비어 있다.)
 */

import process from "node:process";

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = (argValue("--url", process.env.ADMIN_URL || "http://localhost:3000")).replace(/\/$/, "");
const FORCE = args.includes("--force");

function stamp() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function log(msg) {
  console.log(`[${stamp()}] ${msg}`);
}

async function main() {
  const url = `${BASE}/api/stock/scan?notify=1${FORCE ? "&force=1" : ""}`;

  let res;
  try {
    res = await fetch(url, { method: "POST" });
  } catch (e) {
    log(`✗ admin 대시보드에 연결할 수 없습니다 (${BASE}).`);
    log("  cd admin && npm run dev  로 먼저 띄워주세요.");
    process.exitCode = 1;
    return;
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    log(`✗ 스캔 실패: ${json?.message || `HTTP ${res.status}`}`);
    process.exitCode = 1;
    return;
  }

  const { results, notifiedCount, errorCount, telegramConfigured } = json;

  if (!telegramConfigured) {
    log("⚠ 텔레그램이 설정되지 않았습니다 — admin 의 [📈 주식 매매 알림] 탭에서 봇을 연결하세요.");
  }

  log(`${results.length}종목 분석 · 알림 ${notifiedCount}건 · 오류 ${errorCount}건`);

  for (const r of results) {
    const name = r.item?.name ?? "?";
    if (r.error) {
      log(`  ✗ ${name}: ${r.error}`);
      continue;
    }
    const a = r.analysis;
    if (!a) continue;
    const mark = r.notified ? "📨" : a.verdict === "HOLD" ? "  " : "· ";
    const sigs = a.signals.map((s) => s.label).join(", ") || "신호 없음";
    log(`  ${mark}${name} [${a.verdict}] 매수 ${a.buyScore}/매도 ${a.sellScore} — ${sigs}`);
  }
}

main().catch((e) => {
  log(`✗ 예기치 못한 오류: ${e?.message || e}`);
  process.exitCode = 1;
});
