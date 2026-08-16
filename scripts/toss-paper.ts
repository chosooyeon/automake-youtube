/**
 * 토스 보유종목 페이퍼 리포트 — "그때 규칙대로 팔았으면 얼마였나".
 *
 * 실제 주문은 절대 내지 않는다. 토스 API 는 보유종목·체결이력을 **읽기만** 하고,
 * 매도 판정은 우리 신호엔진(signals.ts)을 과거 일봉에 굴려서 종이 위에서만 한다.
 *
 * 실행:
 *   cd admin && npx tsx ../scripts/toss-paper.ts
 *
 * ★ 매수 시점을 체결이력(`GET /api/v1/orders`)에서 실제로 가져온다.
 *   이게 없으면 "사기도 전 날짜에 판" 손익이 나와서 숫자가 통째로 헛것이 된다.
 *
 * 읽는 법:
 *   "지금 팔면"     = 현재가 기준 평가손익 (실제)
 *   "첫 매도신호"   = 매수 후 규칙이 처음 팔라고 한 날에 전량 매도했다면 (규칙을 지켰을 경우)
 *   "최고 매도신호" = 매도신호 중 가장 비쌌던 날 (사후에나 알 수 있음 — 참고용)
 *   "보유중 최고가" = 이론상 최대치. 아무도 못 맞춘다. 눈금 역할일 뿐이다
 */

import {
  isTradingAllowed,
  resolveAccountSeq,
  fetchHoldings,
  fetchFills,
  positionStartDate,
  positionAt,
  type TossHolding,
  type TossFill,
} from "../admin/lib/stock/toss";
import { searchStocks, fetchCandles, type Candle, type StockRef } from "../admin/lib/stock/naver";
import { analyze } from "../admin/lib/stock/signals";
import { loadTradingConfig } from "../admin/lib/stock/tradingConfig";

function money(v: number, currency: string): string {
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return currency === "KRW"
    ? `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`
    : `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function price(v: number, currency: string): string {
  return currency === "KRW"
    ? `${Math.round(v).toLocaleString("ko-KR")}원`
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function ymd(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** 토스 심볼(KR 6자리 / US 티커) → 네이버 조회키 */
async function resolveRef(h: TossHolding): Promise<StockRef | null> {
  const hits = await searchStocks(h.symbol, 8);
  const wantKR = /^\d{6}$/.test(h.symbol);
  return (
    hits.find((x) => (wantKR ? x.market === "KR" : x.market === "US") && x.code.toUpperCase() === h.symbol.toUpperCase()) ??
    hits.find((x) => x.code.toUpperCase() === h.symbol.toUpperCase()) ??
    null
  );
}

interface SellPoint {
  date: string;
  close: number;
}

/**
 * 매수일 이후의 매도신호만 모은다.
 * 지표 계산에는 매수 전 데이터도 쓰지만(워밍업), 판정 결과를 채택하는 건 보유 구간뿐이다.
 * 백테스트 엔진과 같은 원칙 — 그날 종가까지의 데이터로만 판정한다 (미래를 보지 않는다).
 */
function findSellPoints(candles: Candle[], warmup: number, since: string): SellPoint[] {
  const out: SellPoint[] = [];
  for (let i = warmup; i < candles.length; i++) {
    if (candles[i].date < since) continue;
    const a = analyze(candles.slice(0, i + 1));
    if (a.verdict === "SELL" || a.verdict === "STRONG_SELL") {
      out.push({ date: candles[i].date, close: candles[i].close });
    }
  }
  return out;
}

function daysSince(yyyymmdd: string): number {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  return Math.max(1, Math.round((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000));
}

async function main(): Promise<void> {
  const cfg = loadTradingConfig();
  const warmup = cfg.warmupBars ?? 60;

  console.log("토스 보유종목 페이퍼 리포트 — 조회만 합니다. 주문은 나가지 않습니다");
  console.log(`매매 스위치: ${isTradingAllowed() ? "⚠ 열림 (TOSS_TRADING_ENABLED=true)" : "🔒 차단됨 (기본값)"}\n`);

  const accountSeq = await resolveAccountSeq();
  const holdings = (await fetchHoldings(accountSeq)).filter((h) => h.quantity > 0);
  if (!holdings.length) {
    console.log("보유 종목이 없습니다.");
    return;
  }

  console.log("체결이력 조회 중...");
  const allFills = await fetchFills(accountSeq);
  const bySymbol = new Map<string, TossFill[]>();
  for (const f of allFills) {
    const k = f.symbol.toUpperCase();
    bySymbol.set(k, [...(bySymbol.get(k) ?? []), f]);
  }
  console.log(`체결 ${allFills.length}건 · 보유 ${holdings.length}종목\n`);

  // 통화가 다르면 합산이 의미 없으므로 통화별로 모은다
  const totals = new Map<string, { now: number; firstSignal: number; skipped: number }>();
  const bump = (cur: string, patch: Partial<{ now: number; firstSignal: number; skipped: number }>) => {
    const t = totals.get(cur) ?? { now: 0, firstSignal: 0, skipped: 0 };
    totals.set(cur, {
      now: t.now + (patch.now ?? 0),
      firstSignal: t.firstSignal + (patch.firstSignal ?? 0),
      skipped: t.skipped + (patch.skipped ?? 0),
    });
  };

  for (const h of holdings) {
    const cur = h.currency || "KRW";
    const nowPL = (h.lastPrice - h.averagePurchasePrice) * h.quantity;
    const nowPct = h.averagePurchasePrice ? ((h.lastPrice - h.averagePurchasePrice) / h.averagePurchasePrice) * 100 : 0;

    console.log(`── ${h.name} (${h.symbol})`);
    console.log(`   ${h.quantity}주 · 평단 ${price(h.averagePurchasePrice, cur)} · 현재 ${price(h.lastPrice, cur)}`);
    console.log(`   지금 팔면        ${money(nowPL, cur)} (${nowPct >= 0 ? "+" : ""}${nowPct.toFixed(1)}%)`);

    const entry = positionStartDate(bySymbol.get(h.symbol.toUpperCase()) ?? []);
    if (!entry) {
      console.log(`   ⚠ 체결이력에서 매수일을 못 찾아 판정을 건너뜁니다 (조회 범위 밖의 오래된 매수)\n`);
      bump(cur, { now: nowPL, firstSignal: nowPL, skipped: 1 });
      continue;
    }
    console.log(`   보유 시작        ${ymd(entry)} (${daysSince(entry)}일 전)`);

    const ref = await resolveRef(h);
    if (!ref) {
      console.log(`   ⚠ 네이버에서 일봉을 찾지 못해 판정을 건너뜁니다\n`);
      bump(cur, { now: nowPL, firstSignal: nowPL, skipped: 1 });
      continue;
    }

    // 보유기간 + 워밍업(달력 여유 포함)만큼만 받는다
    const candles = await fetchCandles(ref, Math.min(1200, daysSince(entry) + warmup * 2 + 30));
    const held = candles.filter((c) => c.date >= entry);
    if (candles.length <= warmup || !held.length) {
      console.log(`   ⚠ 일봉이 부족해 판정 불가 (${candles.length}봉, 워밍업 ${warmup}봉 필요)\n`);
      bump(cur, { now: nowPL, firstSignal: nowPL, skipped: 1 });
      continue;
    }

    const sells = findSellPoints(candles, warmup, entry);
    const fills = bySymbol.get(h.symbol.toUpperCase()) ?? [];

    /**
     * 그 날짜 시점의 포지션(수량·평단)으로 손익을 계산한다.
     * 오늘의 평단을 과거에 소급하면 분할매수 종목에서 숫자가 통째로 틀어진다.
     */
    const plOn = (date: string, p: number) => {
      const pos = positionAt(fills, date);
      return { pl: (p - pos.avgCost) * pos.quantity, pos };
    };

    let firstSignalPL = nowPL; // 신호가 없었으면 계속 들고 있는 것과 같다
    if (sells.length) {
      const first = sells[0];
      const firstR = plOn(first.date, first.close);
      firstSignalPL = firstR.pl;

      // "가장 좋았던 매도신호"도 그 시점 포지션 기준으로 골라야 한다
      const best = sells.reduce((a, b) => (plOn(b.date, b.close).pl > plOn(a.date, a.close).pl ? b : a));
      const bestR = plOn(best.date, best.close);

      console.log(
        `   첫 매도신호      ${ymd(first.date)} ${price(first.close, cur)} · 당시 ${firstR.pos.quantity}주(평단 ${price(firstR.pos.avgCost, cur)}) → ${money(firstR.pl, cur)}  (지금 대비 ${money(firstR.pl - nowPL, cur)})`
      );
      console.log(
        `   최고 매도신호    ${ymd(best.date)} ${price(best.close, cur)} · 당시 ${bestR.pos.quantity}주(평단 ${price(bestR.pos.avgCost, cur)}) → ${money(bestR.pl, cur)}  (지금 대비 ${money(bestR.pl - nowPL, cur)})`
      );
    } else {
      console.log(`   첫 매도신호      없음 — 규칙은 계속 보유하라고 했습니다`);
    }

    const peak = held.reduce((a, b) => (plOn(b.date, b.high).pl > plOn(a.date, a.high).pl ? b : a));
    console.log(
      `   보유중 최고      ${ymd(peak.date)} ${price(peak.high, cur)} → ${money(plOn(peak.date, peak.high).pl, cur)}  (이론 최대)`
    );
    console.log(`   매도신호 ${sells.length}회 / 보유 ${held.length}거래일\n`);

    bump(cur, { now: nowPL, firstSignal: firstSignalPL });
    await new Promise((r) => setTimeout(r, 200)); // 네이버 과호출 방지
  }

  console.log("────────────────────────────────────────────────────");
  console.log("[합계] 통화가 다르므로 섞지 않습니다");
  for (const [cur, t] of totals) {
    const diff = t.firstSignal - t.now;
    console.log(`  ${cur}`);
    console.log(`    지금 그대로 보유         ${money(t.now, cur)}`);
    console.log(`    규칙 첫 매도신호에 매도   ${money(t.firstSignal, cur)}`);
    console.log(
      `    차이                     ${money(diff, cur)} — ${
        diff > 0 ? "규칙대로 팔았으면 더 벌었습니다" : diff < 0 ? "안 판 게 나았습니다" : "차이 없음"
      }`
    );
    if (t.skipped) console.log(`    (판정 못 한 ${t.skipped}종목은 '지금'과 같게 처리)`);
  }
  console.log("────────────────────────────────────────────────────");
  console.log("주의: 전량을 한 번에 판다고 가정했고, 수수료·세금·슬리피지를 빼지 않은 값입니다.");
  console.log("      '최고 매도신호'와 '보유중 최고가'는 사후에만 알 수 있는 숫자입니다 — 목표치가 아닙니다.");
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
