/**
 * 페이퍼 트레이딩 러너 — 매일 돌려서 가상 매매를 기록한다.
 *
 * 처음 한 번 (계약서 만들기 · 종목과 규칙을 얼린다):
 *   cd admin && npx tsx ../scripts/paper-trade.ts --market KR --init --universe marketCap --top 100
 *   cd admin && npx tsx ../scripts/paper-trade.ts --market US --init          # 관심종목을 그대로 얼린다
 *
 * 그 다음부터 (매일):
 *   cd admin && npx tsx ../scripts/paper-trade.ts --market KR
 *   cd admin && npx tsx ../scripts/paper-trade.ts --market KR --notify        # 텔레그램으로도
 *
 * ⚠ `--init` 은 기존 계약서를 덮어쓴다. 덮어쓰는 순간 그동안의 기록이 무효가 되므로
 * (다른 종목·다른 규칙으로 다시 시작하는 것과 같다) 확인을 한 번 받는다. `--force` 로 건너뛴다.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fetchCandles, type Candle, type Market, type StockRef } from "../admin/lib/stock/naver";
import { loadWatchlist, STOCK_DATA_DIR } from "../admin/lib/stock/store";
import { loadTradingConfig } from "../admin/lib/stock/tradingConfig";
import { fetchUniverse, UNIVERSE_LABEL, type UniverseKind } from "../admin/lib/stock/universe";
import type { SymbolData } from "../admin/lib/stock/backtest";
import {
  formatPaperReport,
  loadPaperCharter,
  paperCharterFile,
  previewEntryCandidates,
  runPaper,
  savePaperCharter,
  type PaperCharter,
} from "../admin/lib/stock/paper";
import { esc, sendTelegram } from "../admin/lib/stock/telegram";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function todayYmd(): string {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

/** YYYYMMDD 로부터 오늘까지 며칠 지났나 */
function daysSinceYmd(ymd: string): number {
  const t = new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8))
  ).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(`${question} [y/N] `, res));
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function buildCharter(market: Market): Promise<PaperCharter> {
  const universeArg = arg("universe") as UniverseKind | undefined;
  const top = Number(arg("top") || 100);

  let universe: StockRef[];
  let universeNote: string;

  if (universeArg) {
    if (market !== "KR") {
      // universe.ts 가 쓰는 네이버 랭킹 API 는 국내 전용이다
      throw new Error("--universe 는 국내(KR)에서만 씁니다. 미국은 관심종목을 얼립니다.");
    }
    universe = await fetchUniverse(universeArg, top);
    universeNote = `${UNIVERSE_LABEL[universeArg]} ${universe.length}종목 (${todayYmd()} 기준 스냅샷)`;
  } else {
    universe = loadWatchlist()
      .filter((w) => w.enabled && w.market === market)
      .map(({ symbol, code, name, market: m, exchange }) => ({ symbol, code, name, market: m, exchange }));
    universeNote = `관심종목 ${universe.length}종목 (${todayYmd()} 기준 스냅샷)`;
  }

  if (universe.length === 0) throw new Error(`${market} 시장에 얼릴 종목이 없습니다.`);

  return {
    market,
    startedAt: arg("start") || todayYmd(),
    universeNote,
    universe,
    // 시작 시점 규칙을 통째로 복사해 둔다. 나중에 config/stock-trading.json 을 고쳐도
    // 이미 진행 중인 페이퍼 기록은 영향을 받지 않아야 한다.
    config: loadTradingConfig(market),
    note:
      "페이퍼 트레이딩 계약서. 진행 중에는 종목도 규칙도 바꾸지 않는다 — " +
      "바꾸는 순간 검증이 아니라 또 한 번의 튜닝이 된다. 바꾸려면 --init 으로 새로 시작한다.",
  };
}

async function main(): Promise<void> {
  const market = (arg("market") || "KR").toUpperCase() as Market;
  if (market !== "KR" && market !== "US") {
    console.error("✗ --market 은 KR 또는 US 여야 합니다.");
    process.exit(1);
  }

  if (flag("init")) {
    const existing = loadPaperCharter(market);
    if (existing && !flag("force")) {
      console.log(`\n⚠ ${market} 계약서가 이미 있습니다 (${existing.startedAt} 시작, ${existing.universe.length}종목).`);
      console.log("  덮어쓰면 그동안의 페이퍼 기록이 무효가 됩니다 (다른 실험이 되므로).");
      if (!(await confirm("  정말 새로 시작할까요?"))) {
        console.log("  취소했습니다.");
        return;
      }
    }
    const charter = await buildCharter(market);
    savePaperCharter(charter);
    console.log(`\n✓ 계약서 생성: ${paperCharterFile(market)}`);
    console.log(`  시작일 ${charter.startedAt} · ${charter.universeNote}`);
    console.log(
      `  규칙   minNetScore ${charter.config.entry.minNetScore} · ` +
        `손절 ATR×${charter.config.exit.stopLossAtrMult} · 익절 ATR×${charter.config.exit.takeProfitAtrMult} · ` +
        `트레일링 ${charter.config.exit.trailingAtrMult ?? "없음"} · 최대보유 ${charter.config.exit.maxHoldDays}봉`
    );
    console.log(`  ★ 이 파일은 커밋하세요. 진행 중에 바꾸면 검증이 무효가 됩니다.\n`);
  }

  const charter = loadPaperCharter(market);
  if (!charter) {
    console.error(
      `✗ ${market} 계약서가 없습니다. 먼저 만드세요:\n` +
        `  npx tsx ../scripts/paper-trade.ts --market ${market} --init` +
        (market === "KR" ? " --universe marketCap --top 100" : "")
    );
    process.exit(1);
  }

  // 워밍업(SMA60·ATR14)에 쓸 과거 봉까지 넉넉히 받는다.
  // 시작일 이후만 받으면 첫 60봉이 지표 계산에 먹혀 석 달을 놓친다.
  //
  // 기간은 시작일에서 자동으로 늘어난다 — 400일로 고정해 두면 페이퍼가 1년을 넘긴 순간
  // 앞부분 기록이 조용히 잘려 나가고, 재생 결과가 어제와 달라진다.
  const spanNeeded = daysSinceYmd(charter.startedAt) + 150; // 150일 = 워밍업 60봉 + 여유
  const days = Number(arg("days") || Math.max(400, spanNeeded));
  console.log(`\n일봉 수집 중 (${charter.universe.length}종목 × 최근 ${days}일)...`);
  const data: SymbolData[] = [];
  let done = 0;
  for (const ref of charter.universe) {
    try {
      const candles: Candle[] = await fetchCandles(ref, days);
      data.push({ ref, candles });
    } catch (e) {
      console.log(`\n  ✗ ${ref.name} ${(e as Error).message} — 제외`);
    }
    process.stdout.write(`\r  ${++done}/${charter.universe.length} ${ref.name.padEnd(16)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\n  ✓ ${data.length}종목 확보\n`);

  const report = runPaper(charter, data);
  const candidates = previewEntryCandidates(charter.config, data);

  let text = formatPaperReport(report);
  // 매수 후보는 "아직 산 게 아니다". 기록(위)과 예고(아래)를 절대 같은 표에 섞지 않는다 —
  // 섞이면 며칠 뒤에 이게 실제 매매였는지 후보였는지 구분할 수 없다.
  text +=
    `\n\n[다음 거래일 매수 후보 ${candidates.length}종목] — 아직 산 것이 아닙니다\n` +
    (candidates.length === 0
      ? "  없음 — 규칙을 통과한 종목이 없습니다.\n"
      : candidates
          .slice(0, 15)
          .map(
            (c) =>
              `  ${c.name.padEnd(16)} 점수 ${String(c.netScore).padStart(2)} · ` +
              `${Math.round(c.close).toLocaleString("ko-KR")} · ${c.signals.slice(0, 3).join("+") || "-"}`
          )
          .join("\n") +
        (candidates.length > 15 ? `\n  … 외 ${candidates.length - 15}종목` : "") +
        `\n  ※ 실제로는 슬롯(최대 ${charter.config.entry.maxOpenPositions}종목)과 현금이 허락하는 만큼만 삽니다.\n`);

  console.log(text);

  const dir = path.join(STOCK_DATA_DIR, "paper");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${market}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ charter, report, candidates, ranAt: new Date().toISOString() }),
    "utf8"
  );
  console.log(`\n저장: ${file}`);

  if (flag("notify")) {
    // 매매가 없고 후보도 없는 날은 보내지 않는다 — 매일 "변화 없음" 이 오면
    // 정작 매매가 일어난 날의 알림도 같이 안 읽게 된다.
    const quiet =
      report.todayEntries.length === 0 &&
      report.todayExits.length === 0 &&
      candidates.length === 0 &&
      report.openPositions.length === 0;

    if (quiet && !flag("always-notify")) {
      console.log("텔레그램 발송 생략 — 매매·보유·후보가 모두 없는 날입니다 (--always-notify 로 강제).");
    } else {
      const flagEmoji = market === "KR" ? "🇰🇷" : "🇺🇸";
      const head =
        `${flagEmoji} <b>페이퍼 트레이딩 ${market}</b> · ${report.asOf}\n` +
        `매수 ${report.todayEntries.length} · 매도 ${report.todayExits.length} · ` +
        `보유 ${report.openPositions.length} · 후보 ${candidates.length}\n`;

      // 텔레그램 본문은 4096자 제한이라 헤더 몫을 빼고 자른다
      const LIMIT = 3600;
      const body = text.length > LIMIT ? text.slice(0, LIMIT) + "\n…(생략 — admin 📝 페이퍼 탭에서 전체 확인)" : text;
      const r = await sendTelegram(head + "<pre>" + esc(body) + "</pre>");
      console.log(r.ok ? "텔레그램 발송 완료" : `텔레그램 발송 실패: ${r.error ?? "unknown"}`);
      if (!r.ok) process.exitCode = 1; // CI 가 조용히 성공으로 끝나면 안 된다
    }
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
