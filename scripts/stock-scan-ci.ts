/**
 * admin 서버 없이 도는 관심종목 스캔 (GitHub Actions 용).
 *
 * scripts/stock-watch.mjs 는 admin API 를 호출하므로 맥이 켜져 있어야 한다.
 * 이 스크립트는 판정 로직(admin/lib/stock/*)을 직접 import 해서 서버 없이 돈다 —
 * 로직을 두 번 구현하지 않으려는 것. 실행은 tsx 가 담당한다.
 *
 * 실행 (cwd 는 반드시 admin/ — lib/paths.ts 의 REPO_ROOT 가 cwd 기준이다):
 *   cd admin && npx tsx ../scripts/stock-scan-ci.ts
 *
 * 텔레그램 설정은 admin/data/stock/telegram.json 이 없으면 환경변수를 쓴다:
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
 */

import { scanWatchlist } from "../admin/lib/stock/scan";
import { loadTelegramConfig } from "../admin/lib/stock/store";

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  const cfg = loadTelegramConfig();
  if (!cfg.botToken || !cfg.chatId) {
    log("✗ 텔레그램 설정 없음 — TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 를 확인하세요.");
    process.exit(1);
  }

  const summary = await scanWatchlist({ notify: true });

  log(`${summary.results.length}종목 분석 · 알림 ${summary.notifiedCount}건 · 오류 ${summary.errorCount}건`);
  for (const r of summary.results) {
    if (r.error) {
      log(`  ✗ ${r.item.name}: ${r.error}`);
      continue;
    }
    const a = r.analysis;
    if (!a) continue;
    const mark = r.notified ? "📨" : "  ";
    const sigs = a.signals.map((s) => s.label).join(", ") || "신호 없음";
    log(`  ${mark}${r.item.name} [${a.verdict}] 매수 ${a.buyScore}/매도 ${a.sellScore} — ${sigs}`);
  }

  // 종목 몇 개가 실패해도 워크플로 전체를 실패로 만들진 않는다 (네이버 일시 오류로 매일 빨간불이 뜨면 무시하게 된다).
  // 전부 실패했을 때만 실패로 처리한다 — 그건 진짜 고장이다.
  if (summary.results.length > 0 && summary.errorCount === summary.results.length) {
    log("✗ 모든 종목 조회 실패 — 데이터 소스 점검 필요");
    process.exit(1);
  }
}

main().catch((e) => {
  log(`✗ 예기치 못한 오류: ${(e as Error)?.message || e}`);
  process.exit(1);
});
