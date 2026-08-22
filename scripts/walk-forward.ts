/**
 * 워크포워드 검증 — 과최적화를 잡아내는 유일한 장치.
 *
 * 스윕(backtest-sweep.ts)은 전 구간을 보고 제일 좋은 설정을 고른다. 그렇게 고른 숫자는
 * "과거에 맞춰 깎은 것"이라 미래에 재현되지 않는다. 이 스크립트는 그 함정을 절차로 막는다:
 *
 *   1) 학습구간(split 이전)에서만 모든 설정을 돌린다
 *   2) **미리 정해둔 규칙**으로 승자를 고른다 (사람이 눈으로 고르지 않는다 ← 핵심)
 *   3) 승자 하나만 검증구간(split 이후)에 딱 한 번 돌린다
 *
 * 왜 스크립트로 고정하나: 이 절차를 손으로 하면 검증 성적을 본 뒤에 "그럼 저 설정으로"
 * 하고 되돌아가게 된다. 그 순간 검증구간도 학습구간이 되어 검증이 사라진다.
 * 그래서 선택 규칙(pickWinner)을 코드에 박아두고, 검증구간엔 승자만 내보낸다.
 *
 * 실행 (cwd 는 반드시 admin/):
 *   cd admin && npx tsx ../scripts/walk-forward.ts
 *   cd admin && npx tsx ../scripts/walk-forward.ts --split 20250630 --market KR
 *
 * 옵션: --market / --days / --split / --capital
 */

import fs from "node:fs";
import path from "node:path";
import { fetchCandles, type Candle, type Market, type StockRef } from "../admin/lib/stock/naver";
import { loadWatchlist, STOCK_DATA_DIR } from "../admin/lib/stock/store";
import { describeRules, loadTradingConfig, type TradingConfig } from "../admin/lib/stock/tradingConfig";
import {
  runBacktest,
  verdictLines,
  type BacktestResult,
  type SymbolData,
} from "../admin/lib/stock/backtest";
import { fetchUniverse, UNIVERSE_LABEL, type UniverseKind } from "../admin/lib/stock/universe";
import { fetchIndustries } from "../admin/lib/stock/industry";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function clone(cfg: TradingConfig): TradingConfig {
  return JSON.parse(JSON.stringify(cfg));
}

/** 후보 설정. backtest-sweep.ts 의 VARIANTS 와 같은 목록이어야 비교가 이어진다 */
const CANDIDATES: Array<{ id: string; label: string; apply: (c: TradingConfig) => void }> = [
  { id: "baseline", label: "현재 설정", apply: () => {} },
  { id: "score6", label: "신호 엄격 (점수 6)", apply: (c) => void (c.entry.minNetScore = 6) },
  { id: "score5", label: "신호 엄격 (점수 5)", apply: (c) => void (c.entry.minNetScore = 5) },
  { id: "score7", label: "신호 엄격 (점수 7)", apply: (c) => void (c.entry.minNetScore = 7) },
  { id: "ind1", label: "업종당 1종목", apply: (c) => void (c.entry.maxPerIndustry = 1) },
  { id: "ind2", label: "업종당 2종목", apply: (c) => void (c.entry.maxPerIndustry = 2) },
  { id: "indoff", label: "업종제한 없음", apply: (c) => void (c.entry.maxPerIndustry = null) },
  { id: "trail", label: "트레일링 스톱", apply: (c) => void (c.exit.trailingAtrMult = 2.5) },
  { id: "nosignal", label: "매도신호 무시", apply: (c) => void (c.exit.exitOnSellVerdict = false) },
  {
    id: "score6trail",
    label: "엄격 + 트레일링",
    apply: (c) => {
      c.entry.minNetScore = 6;
      c.exit.trailingAtrMult = 2.5;
    },
  },
  {
    id: "score6slots8",
    label: "엄격 + 슬롯 8",
    apply: (c) => {
      c.entry.minNetScore = 6;
      c.entry.maxOpenPositions = 8;
    },
  },
];

/** 학습구간에서 최소 이만큼은 거래해야 후보로 인정한다 (전 구간 100회 기준의 축소판) */
const MIN_TRAIN_TRADES = 30;

/**
 * 승자 선택 규칙 — **검증 성적을 보기 전에 확정되어 있어야 한다.**
 * 기대값(R)이 1순위인 이유: 수익률은 매매 횟수에 비례해 부풀지만
 * 기대값은 "1회당 얼마나 우위가 있나"라서 구간 길이에 덜 흔들린다.
 */
function pickWinner<T extends { id: string; label: string; result: BacktestResult }>(
  runs: T[]
): { winner: T | null; reason: string } {
  const eligible = runs.filter((r) => r.result.metrics.trades >= MIN_TRAIN_TRADES);
  if (eligible.length === 0) {
    return { winner: null, reason: `학습구간 거래 ${MIN_TRAIN_TRADES}회를 넘긴 후보가 없습니다` };
  }
  const sorted = [...eligible].sort((a, b) => {
    const d = b.result.metrics.expectancyR - a.result.metrics.expectancyR;
    return d !== 0 ? d : b.result.metrics.profitFactor - a.result.metrics.profitFactor;
  });
  const w = sorted[0];
  return {
    winner: w,
    reason:
      `학습구간 거래 ${MIN_TRAIN_TRADES}회 이상인 후보 ${eligible.length}개 중 ` +
      `기대값 최고 (${w.result.metrics.expectancyR.toFixed(3)}R)`,
  };
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function row(label: string, m: BacktestResult["metrics"], bench: number): string {
  return (
    `  ${label.padEnd(20)} 거래 ${String(m.trades).padStart(4)}회 · ` +
    `PF ${m.profitFactor.toFixed(2).padStart(5)} · ` +
    `기대값 ${(m.expectancyR >= 0 ? "+" : "") + m.expectancyR.toFixed(3)}R · ` +
    `수익 ${pct(m.totalReturnPct).padStart(7)} · MDD -${m.maxDrawdownPct.toFixed(1)}% · ` +
    `보유 ${pct(bench)}`
  );
}

async function main(): Promise<void> {
  const market = (arg("market") || "KR").toUpperCase() as Market;
  const days = Number(arg("days") || 1000);
  const split = arg("split") || "20250630";
  const top = Number(arg("top") || 100);
  const universes = (arg("universe") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as UniverseKind[];

  // 검증 대상은 "이 시장의 규칙"이다 — 공통값으로 돌리면 미국 규칙은 검증되지 않는다
  const base = loadTradingConfig(market);
  const capitalOverride = arg("capital");
  if (capitalOverride) base.capital = Number(capitalOverride);

  console.log(`\n검증 대상 규칙: ${base.marketLabel} — ${describeRules(base)}`);

  // 유니버스별 종목 목록을 먼저 확정한다.
  // 여러 유니버스를 한 번에 돌리는 이유: 시총 상위와 거래대금 상위는 크게 겹치므로
  // 합집합을 한 번만 받아 쓰면 일봉 수집이 두 배로 늘지 않는다.
  const runs: Array<{ key: string; label: string; refs: StockRef[] }> = [];
  if (universes.length > 0) {
    for (const kind of universes) {
      if (kind !== "marketCap" && kind !== "tradingValue") {
        console.error(`✗ 알 수 없는 유니버스: ${kind} (marketCap | tradingValue)`);
        process.exit(1);
      }
      const refs = await fetchUniverse(kind, top);
      runs.push({ key: kind, label: `${UNIVERSE_LABEL[kind]} ${refs.length}종목`, refs });
      console.log(`유니버스 [${UNIVERSE_LABEL[kind]}] ${refs.length}종목 — ${refs.slice(0, 6).map((r) => r.name).join(", ")} …`);
    }
  } else {
    const refs: StockRef[] = loadWatchlist()
      .filter((w) => w.enabled && w.market === market)
      .map(({ symbol, code, name, market: m, exchange }) => ({ symbol, code, name, market: m, exchange }));
    runs.push({ key: "watchlist", label: `관심종목 ${refs.length}종목`, refs });
  }

  const allRefs = new Map<string, StockRef>();
  for (const r of runs) for (const ref of r.refs) allRefs.set(ref.symbol, ref);

  if (allRefs.size === 0) {
    console.error(`✗ 백테스트할 종목이 없습니다.`);
    process.exit(1);
  }

  // 업종 후보(ind1/ind2)가 목록에 있으므로 국내는 항상 업종을 받아둔다
  const industryMap =
    market === "KR"
      ? await fetchIndustries([...allRefs.values()].map((r) => r.code))
      : new Map<string, string>();

  console.log(`\n일봉 수집 중 (합집합 ${allRefs.size}종목 × 최근 ${days}일)...`);
  const bySymbol = new Map<string, SymbolData>();
  let done = 0;
  for (const ref of allRefs.values()) {
    try {
      const candles: Candle[] = await fetchCandles(ref, days);
      bySymbol.set(ref.symbol, { ref, candles, industry: industryMap.get(ref.code) });
    } catch (e) {
      console.log(`\n  ✗ ${ref.name} ${(e as Error).message} — 제외`);
    }
    process.stdout.write(`\r  ${++done}/${allRefs.size} ${ref.name.padEnd(16)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\n  ✓ ${bySymbol.size}종목 확보\n`);

  for (const run of runs) {
    const data = run.refs.map((r) => bySymbol.get(r.symbol)).filter((d): d is SymbolData => !!d);
    console.log(`\n${"═".repeat(72)}`);
    console.log(`  ${run.label}`);
    console.log(`${"═".repeat(72)}`);
    await walkForward(run.key, run.label, data, base, split, market);
  }
}

async function walkForward(
  key: string,
  runLabel: string,
  full: SymbolData[],
  base: TradingConfig,
  split: string,
  market: Market
): Promise<void> {
  // ── 구간 자르기 ────────────────────────────────────────────────
  // 학습: 처음 ~ split
  const train: SymbolData[] = full.map((s) => ({
    ref: s.ref,
    candles: s.candles.filter((c) => c.date <= split),
    industry: s.industry,
  }));

  // 검증: split 이후. 단 지표 워밍업(SMA60·ATR14)에 쓸 과거 봉을 앞에 붙인다.
  // 그냥 split 이후만 잘라 넘기면 첫 60봉이 워밍업에 통째로 먹혀
  // 검증구간 석 달이 그냥 날아간다. 워밍업 구간엔 어차피 진입하지 않으므로
  // 학습 데이터가 새는 게 아니라, 검증구간 전체를 실제로 쓰는 것이다.
  const validation: SymbolData[] = full.map((s) => {
    const splitIdx = s.candles.findIndex((c) => c.date > split);
    if (splitIdx < 0) return { ref: s.ref, candles: [], industry: s.industry };
    const from = Math.max(0, splitIdx - base.warmupBars);
    return { ref: s.ref, candles: s.candles.slice(from), industry: s.industry };
  });

  const trainBars = Math.max(...train.map((s) => s.candles.length));
  const valBars = Math.max(...validation.map((s) => s.candles.length));
  console.log(`분할 기준일 ${split}`);
  console.log(`  학습구간  ~${split}      (최대 ${trainBars}봉)`);
  console.log(`  검증구간  ${split} 이후  (최대 ${valBars}봉, 앞 ${base.warmupBars}봉은 지표 워밍업)\n`);

  // ── 1단계: 학습구간에서 모든 후보 ──────────────────────────────
  console.log("── 1단계 · 학습구간 (여기서만 설정을 고른다) ────────────────");
  const trainRuns = CANDIDATES.map((c) => {
    const cfg = clone(base);
    c.apply(cfg);
    const result = runBacktest(train, cfg);
    console.log(row(c.label, result.metrics, result.benchmarkReturnPct));
    return { id: c.id, label: c.label, cfg, result };
  });

  // ── 2단계: 규칙으로 승자 선택 ──────────────────────────────────
  const { winner, reason } = pickWinner(trainRuns);
  console.log(`\n── 2단계 · 승자 선택 ────────────────────────────────────────`);
  console.log(`  규칙: ${reason}`);
  if (!winner) {
    console.log("\n✗ 검증할 후보가 없습니다. 종목이나 기간을 늘리세요. — 이 유니버스는 건너뜁니다.");
    return; // 다른 유니버스는 계속 돌려야 하므로 프로세스를 죽이지 않는다
  }
  console.log(`  → ${winner.label} (${winner.id})`);
  console.log(
    `     minNetScore ${winner.cfg.entry.minNetScore} · maxOpenPositions ${winner.cfg.entry.maxOpenPositions} · ` +
      `trailingAtrMult ${winner.cfg.exit.trailingAtrMult ?? "null"} · exitOnSellVerdict ${winner.cfg.exit.exitOnSellVerdict}`
  );

  // ── 3단계: 검증구간에 승자만 딱 한 번 ──────────────────────────
  console.log(`\n── 3단계 · 검증구간 (승자만, 한 번만) ───────────────────────`);
  const valResult = runBacktest(validation, winner.cfg);
  console.log(row(winner.label, valResult.metrics, valResult.benchmarkReturnPct));

  const tm = winner.result.metrics;
  const vm = valResult.metrics;

  console.log(`\n── 판정 ────────────────────────────────────────────────────`);
  console.log(`  기대값   학습 ${tm.expectancyR.toFixed(3)}R  →  검증 ${vm.expectancyR.toFixed(3)}R`);
  console.log(`  PF       학습 ${tm.profitFactor.toFixed(2)}     →  검증 ${vm.profitFactor.toFixed(2)}`);
  console.log(`  승률     학습 ${tm.winRatePct.toFixed(1)}%    →  검증 ${vm.winRatePct.toFixed(1)}%`);
  console.log(`  MDD      학습 -${tm.maxDrawdownPct.toFixed(1)}%    →  검증 -${vm.maxDrawdownPct.toFixed(1)}%`);
  console.log("");
  for (const l of verdictLines(valResult)) console.log(`  ${l}`);

  // 과최적화 판정.
  //
  // 비율(검증÷학습)만 보면 안 되는 이유: 학습 기대값이 0.01R 처럼 0 근처면
  // 검증이 0.05R 만 나와도 "500% 유지"가 되어 합격처럼 보인다. 분모가 거의 0인 비율은
  // 정보가 아니라 착시다. 그래서 판정을 세 갈래로 나눈다.
  const MIN_MEANINGFUL_R = 0.1; // 학습 기대값이 이보다 작으면 애초에 고를 만한 우위가 아니었다
  const MIN_VAL_TRADES = 30; // 검증 표본이 이보다 적으면 어느 쪽으로도 결론 못 낸다

  let held: boolean | null; // null = 판정 불가
  console.log("");
  if (vm.trades < MIN_VAL_TRADES) {
    held = null;
    console.log(
      `  ⚪ 판정 불가 — 검증구간 거래가 ${vm.trades}회뿐입니다 (최소 ${MIN_VAL_TRADES}회 필요).\n` +
        `     좋게 나왔든 나쁘게 나왔든 이 숫자로는 아무것도 말할 수 없습니다.`
    );
  } else if (tm.expectancyR < MIN_MEANINGFUL_R) {
    held = null;
    console.log(
      `  ⚪ 판정 불가 — 학습구간 기대값이 ${tm.expectancyR.toFixed(3)}R 로 애초에 우위라 할 게 없었습니다.\n` +
        `     0 근처를 분모로 한 "몇 % 유지" 는 의미가 없습니다.`
    );
  } else if (vm.expectancyR >= tm.expectancyR * 0.5) {
    held = true;
    console.log(
      `  ✅ 검증구간에서도 유지됐습니다 (기대값이 학습의 ${((vm.expectancyR / tm.expectancyR) * 100).toFixed(0)}%).`
    );
  } else if (vm.expectancyR > 0) {
    held = false;
    console.log(
      `  ⚠ 살아는 있지만 크게 줄었습니다 (학습의 ${((vm.expectancyR / tm.expectancyR) * 100).toFixed(0)}%). 과최적화를 의심하세요.`
    );
  } else {
    held = false;
    console.log(`  ❌ 검증구간 기대값이 음수입니다. 학습구간에 맞춰 깎인 설정입니다 — 실전에 쓰면 안 됩니다.`);
  }
  console.log(
    `\n  ※ 이 결과를 보고 설정을 다시 고르면 검증구간도 학습구간이 됩니다. 고칠 거면 split 을 옮기고 처음부터.`
  );
  if (held === true) {
    console.log(
      `  ※ 통과했다면 config/stock-trading.json 의 markets.${market}.verifiedAt 에 오늘 날짜를 적으세요.\n` +
        `     그 칸이 null 인 동안 화면은 이 규칙을 "검증 전 가설"로 표시합니다.`
    );
  }

  const dir = path.join(STOCK_DATA_DIR, "backtest");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `walkforward-${market}-${key}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      market,
      universe: key,
      universeLabel: runLabel,
      split,
      symbols: full.map((s) => s.ref.name),
      selectionRule: reason,
      winner: { id: winner.id, label: winner.label, config: winner.cfg },
      train: trainRuns.map((r) => ({
        id: r.id,
        label: r.label,
        metrics: r.result.metrics,
        benchmarkReturnPct: r.result.benchmarkReturnPct,
      })),
      validation: {
        metrics: vm,
        benchmarkReturnPct: valResult.benchmarkReturnPct,
        benchmarkMaxDrawdownPct: valResult.benchmarkMaxDrawdownPct,
        verdicts: verdictLines(valResult),
        held,
      },
    }),
    "utf8"
  );
  console.log(`\n저장: ${file}`);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).stack || e}`);
  process.exit(1);
});
