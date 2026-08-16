/**
 * 백테스트 CLI — admin 서버 없이 판정 로직을 그대로 돌린다.
 *
 * 실행 (cwd 는 반드시 admin/ — lib/paths.ts 의 REPO_ROOT 가 cwd 기준이다):
 *   cd admin && npx tsx ../scripts/backtest.ts
 *   cd admin && npx tsx ../scripts/backtest.ts --market US --days 1200
 *   cd admin && npx tsx ../scripts/backtest.ts --symbols 005930,000660 --from 20250101
 *
 * 옵션
 *   --market KR|US     시장 선택 (기본 KR). 통화가 다르므로 섞지 않는다
 *   --days N           끌어올 과거 일수 (달력 기준, 기본 1000 ≈ 2.7년)
 *   --symbols a,b      관심종목 대신 특정 종목코드만
 *   --from / --to      YYYYMMDD 구간 자르기 (학습구간/검증구간 분리용)
 *   --capital N        원금 덮어쓰기
 *   --json             결과 JSON 을 admin/data/stock/backtest/ 에 저장
 *   --trades           개별 매매 내역까지 출력
 */

import fs from "node:fs";
import path from "node:path";
import { fetchCandles, type Candle, type Market, type StockRef } from "../admin/lib/stock/naver";
import { loadWatchlist, STOCK_DATA_DIR } from "../admin/lib/stock/store";
import { describeRules, loadTradingConfig, validateTradingConfig } from "../admin/lib/stock/tradingConfig";
import { formatReport, runBacktest, type SymbolData } from "../admin/lib/stock/backtest";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const market = (arg("market") || "KR").toUpperCase() as Market;
  const days = Number(arg("days") || 1000);
  const from = arg("from");
  const to = arg("to");
  const only = arg("symbols")?.split(",").map((s) => s.trim()).filter(Boolean);

  // 시장을 넘겨야 그 시장 규칙(markets.KR / markets.US)이 얹힌다.
  // 안 넘기면 공통값으로 도는데, 그게 미국을 국내 규칙으로 굴려 -13.1% 가 나왔던 상태다.
  const cfg = loadTradingConfig(market);
  const capitalOverride = arg("capital");
  if (capitalOverride) cfg.capital = Number(capitalOverride);

  console.log(`\n규칙: ${cfg.marketLabel} — ${describeRules(cfg)}`);
  for (const w of validateTradingConfig(cfg)) console.log(`⚠ ${w}`);

  let refs: StockRef[] = loadWatchlist()
    .filter((w) => w.enabled && w.market === market)
    .map(({ symbol, code, name, market: m, exchange }) => ({ symbol, code, name, market: m, exchange }));

  if (only) refs = refs.filter((r) => only.includes(r.code) || only.includes(r.symbol));

  if (refs.length === 0) {
    console.error(
      `✗ ${market} 시장의 관심종목이 없습니다. admin [📈 주식] 탭에서 추가하거나 --symbols 로 지정하세요.`
    );
    process.exit(1);
  }

  console.log(`\n일봉 수집 중 (${refs.length}종목 × 최근 ${days}일)...`);
  const data: SymbolData[] = [];
  for (const ref of refs) {
    try {
      let candles: Candle[] = await fetchCandles(ref, days);
      if (from) candles = candles.filter((c) => c.date >= from);
      if (to) candles = candles.filter((c) => c.date <= to);
      console.log(`  ✓ ${ref.name.padEnd(12)} ${candles.length}봉`);
      data.push({ ref, candles });
    } catch (e) {
      console.log(`  ✗ ${ref.name.padEnd(12)} ${(e as Error).message} — 제외`);
    }
    await new Promise((r) => setTimeout(r, 250)); // 네이버 비공식 API 예의상 간격
  }

  if (data.length === 0) {
    console.error("✗ 수집된 데이터가 없습니다.");
    process.exit(1);
  }

  console.log("\n판정 계산 중...");
  const result = runBacktest(data, cfg, {
    onProgress: (done, total, label) => {
      if (done < total) process.stdout.write(`\r  ${done + 1}/${total} ${label}          `);
      else process.stdout.write(`\r  ${total}/${total} 완료          \n`);
    },
  });

  console.log("\n" + formatReport(result));

  if (flag("trades")) {
    console.log("\n[매매 내역]");
    for (const t of result.trades) {
      const sign = t.pnl >= 0 ? "+" : "";
      console.log(
        `  ${t.entryDate}→${t.exitDate} ${t.name.padEnd(10)} ` +
          `${sign}${t.pnlPct.toFixed(1)}% (${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R) ` +
          `${t.holdBars}봉 · ${t.reason} · ${t.entrySignals.join("+") || "-"}`
      );
    }
  }

  if (flag("json")) {
    const dir = path.join(STOCK_DATA_DIR, "backtest");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
    const file = path.join(dir, `${market}-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(result, null, 2), "utf8");
    console.log(`\n저장: ${file}`);
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).stack || e}`);
  process.exit(1);
});
