/**
 * 매매 안전장치 현황판 — "지금 주문이 나갈 수 있는 경로가 있나"를 한 화면에서 확인한다.
 *
 * 아무 API 도 호출하지 않는다. .env 와 가드 함수만 읽어서 판정한다.
 *
 * 실행:
 *   cd admin && npx tsx ../scripts/trading-status.ts
 */

import { resolveMode, isLiveAllowed, assertTradingAllowed as kisAssert } from "../admin/lib/stock/kis";
import { isTradingAllowed as tossAllowed, assertTradingAllowed as tossAssert } from "../admin/lib/stock/toss";

/** 가드를 실제로 불러본다. 설명을 믿지 말고 코드가 막는지를 확인한다 */
function probe(label: string, fn: () => void): string {
  try {
    fn();
    return `⚠ ${label} — 열려 있음`;
  } catch {
    return `🔒 ${label} — 차단됨`;
  }
}

const mode = resolveMode();

console.log("매매 안전장치 현황\n");
console.log(`  STOCK_MODE            ${mode}${mode === "dry" ? "  (기본값 — 주문 안 나감)" : ""}`);
console.log(`  KIS 실계좌 이중잠금    ${isLiveAllowed() ? "⚠ 해제됨" : "🔒 잠김"}`);
console.log(`  TOSS_TRADING_ENABLED  ${tossAllowed() ? "⚠ true" : "false"}`);

console.log("\n실제로 가드를 호출해본 결과");
console.log(`  ${probe("KIS 주문", () => kisAssert("현황 점검"))}`);
console.log(`  ${probe("토스 주문", () => tossAssert("현황 점검"))}`);

console.log("\n구조적 보장 (설정과 무관)");
console.log("  · admin/lib/stock/kis.ts  · toss.ts 에는 주문 함수가 없다 (GET 전용 통로 하나뿐)");
console.log("  · scripts/kis-check.ts 는 모의 도메인·모의 tr_id 로 하드코딩되어 실계좌를 못 부른다");

const anyOpen = isLiveAllowed() || tossAllowed();
console.log(
  `\n${anyOpen ? "⚠ 열린 경로가 있습니다. 의도한 것인지 확인하세요." : "✓ 실제 돈이 나가는 경로는 전부 막혀 있습니다."}`
);
