/**
 * 파라미터 스윕 — 같은 일봉 데이터로 여러 설정 × 여러 자산군을 돌려 비교표를 만든다.
 *
 * 백테스트 1회(`backtest.ts`)는 "이 설정이 합격이냐"만 답한다. 스윕은 "어느 손잡이를
 * 돌려야 하냐"와 "어떤 자산에서 통하냐"에 답한다. 일봉 수집은 한 번만 하고(네이버 호출 절약)
 * 설정·종목군만 바꿔가며 runBacktest 를 반복하므로, 조합을 늘려도 네트워크 비용은 1회분이다.
 *
 * 자산군은 config/stock-groups.json 이 정한다. 거기 없는 종목은 '개별주'로 자동 분류되고,
 * '전체' 그룹은 항상 맨 앞에 붙는다. 지수 ETF와 개별주를 한 솥에 넣고 돌리면
 * 어느 쪽이 성적을 만들었는지 알 수 없어서 나눈다.
 *
 * 결과는 admin/data/stock/backtest/sweep-{market}.json 에 저장되고
 * admin [📈 주식] 탭의 [🧪 백테스트] 서브탭이 그 파일을 읽는다.
 *
 * 실행 (cwd 는 반드시 admin/ — lib/paths.ts 의 REPO_ROOT 가 cwd 기준이다):
 *   cd admin && npx tsx ../scripts/backtest-sweep.ts
 *   cd admin && npx tsx ../scripts/backtest-sweep.ts --market US --days 1200
 *
 * 옵션은 backtest.ts 와 동일: --market / --days / --from / --to / --symbols / --capital
 */

import fs from "node:fs";
import path from "node:path";
import { fetchCandles, type Candle, type Market, type StockRef } from "../admin/lib/stock/naver";
import { loadWatchlist, STOCK_DATA_DIR } from "../admin/lib/stock/store";
import { describeRules, loadTradingConfig, type TradingConfig } from "../admin/lib/stock/tradingConfig";
import { runBacktest, verdictLines, type SymbolData } from "../admin/lib/stock/backtest";
import { CONFIG_DIR } from "../admin/lib/paths";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 깊은 복사 — 변형끼리 설정 객체를 공유하면 앞 변형의 수정이 뒤로 샌다 */
function clone(cfg: TradingConfig): TradingConfig {
  return JSON.parse(JSON.stringify(cfg));
}

interface Variant {
  id: string;
  label: string;
  /** 무엇을 바꿨는지 — UI 에 그대로 표시된다 */
  change: string;
  /** 왜 이걸 시험하는지 */
  why: string;
  apply: (c: TradingConfig) => void;
}

/**
 * 변형 목록. 순서가 곧 차트의 색 순서(--c-series-1..6)이므로 섞지 말 것.
 * baseline 이 항상 첫 번째여야 비교 기준이 고정된다.
 */
const VARIANTS: Variant[] = [
  {
    id: "baseline",
    label: "현재 설정",
    change: "config/stock-trading.json 그대로",
    why: "나머지 변형을 재는 기준선",
    apply: () => {},
  },
  {
    id: "score6",
    label: "신호 엄격 (점수 6)",
    change: "entry.minNetScore 4 → 6",
    why: "거래 수를 줄여 수수료·세금 부담을 낮춘다. 슬롯 경쟁도 함께 완화된다",
    apply: (c) => {
      c.entry.minNetScore = 6;
    },
  },
  {
    id: "trail",
    label: "트레일링 스톱",
    change: "exit.trailingAtrMult null → 2.5",
    why: "이긴 거래를 익절선에서 끊지 않고 추세 끝까지 태운다",
    apply: (c) => {
      c.exit.trailingAtrMult = 2.5;
    },
  },
  {
    id: "nosignal",
    label: "매도신호 무시",
    change: "exit.exitOnSellVerdict true → false",
    why: "청산의 59%를 차지하던 매도신호가 수익을 조기에 자르는지 확인하는 대조군",
    apply: (c) => {
      c.exit.exitOnSellVerdict = false;
    },
  },
  {
    id: "score6trail",
    label: "엄격 + 트레일링",
    change: "minNetScore 6 · trailingAtrMult 2.5",
    why: "위 두 개가 각각 먹힌다면 합쳤을 때도 먹히는지",
    apply: (c) => {
      c.entry.minNetScore = 6;
      c.exit.trailingAtrMult = 2.5;
    },
  },
  {
    id: "slip20",
    label: "비용 스트레스",
    change: "costs.slippageBps 10 → 20",
    why: "실전 체결이 백테스트보다 나쁠 때도 살아남는지. 여기서 무너지면 엣지가 비용에 잠긴 것",
    apply: (c) => {
      c.costs.slippageBps = 20;
    },
  },
];

interface GroupDef {
  id: string;
  label: string;
  note?: string;
  symbols: string[];
}

/**
 * config/stock-groups.json 을 읽어 실제 종목군을 만든다.
 * '전체'는 항상 맨 앞, 분류표에 없는 종목은 '개별주'로 뒤에 모인다.
 * 그래서 admin 에서 종목을 추가해도 분류표를 손댈 필요가 없다.
 */
function resolveGroups(market: Market, all: SymbolData[]): GroupDef[] {
  let defs: Array<{ id: string; label: string; note?: string; symbols: string[] }> = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "stock-groups.json"), "utf8"));
    defs = Array.isArray(raw?.[market]) ? raw[market] : [];
  } catch {
    defs = []; // 분류표가 없으면 전체 하나로만 돌린다
  }

  const present = new Set(all.map((d) => d.ref.symbol));
  const out: GroupDef[] = [
    { id: "all", label: "전체", note: `${market} 관심종목 전부`, symbols: [...present] },
  ];

  const claimed = new Set<string>();
  for (const d of defs) {
    const symbols = (d.symbols ?? []).filter((s) => present.has(s));
    if (symbols.length === 0) continue;
    symbols.forEach((s) => claimed.add(s));
    out.push({ id: d.id, label: d.label, note: d.note, symbols });
  }

  const rest = [...present].filter((s) => !claimed.has(s));
  // 그룹이 하나도 안 잡혔으면 '개별주'는 '전체'와 같아지므로 만들지 않는다
  if (rest.length > 0 && out.length > 1) {
    out.push({ id: "stock", label: "개별주", note: "분류표에 없는 나머지", symbols: rest });
  }
  return out;
}

async function main(): Promise<void> {
  const market = (arg("market") || "KR").toUpperCase() as Market;
  const days = Number(arg("days") || 1000);
  const from = arg("from");
  const to = arg("to");
  const only = arg("symbols")?.split(",").map((s) => s.trim()).filter(Boolean);

  // 시장 규칙(markets.KR / markets.US)을 얹은 설정이 기준선(baseline)이 된다.
  // 안 얹으면 미국 스윕이 국내 규칙을 기준으로 비교하게 되어 표 전체가 헛것이 된다.
  const base = loadTradingConfig(market);
  const capitalOverride = arg("capital");
  if (capitalOverride) base.capital = Number(capitalOverride);

  console.log(`\n기준 규칙: ${base.marketLabel} — ${describeRules(base)}`);
  if (!base.verifiedAt) console.log("⚠ 이 시장 규칙은 아직 워크포워드 검증 전입니다 (가설).");

  let refs: StockRef[] = loadWatchlist()
    .filter((w) => w.enabled && w.market === market)
    .map(({ symbol, code, name, market: m, exchange }) => ({ symbol, code, name, market: m, exchange }));

  if (only) refs = refs.filter((r) => only.includes(r.code) || only.includes(r.symbol));

  if (refs.length === 0) {
    console.error(`✗ ${market} 시장의 관심종목이 없습니다.`);
    process.exit(1);
  }

  // 일봉은 한 번만 받아서 모든 변형이 공유한다 — 변형마다 다시 받으면
  // 데이터가 미묘하게 달라져 비교 자체가 무의미해진다.
  console.log(`\n일봉 수집 중 (${refs.length}종목 × 최근 ${days}일) — 변형 전체가 공유합니다...`);
  const data: SymbolData[] = [];
  for (const ref of refs) {
    try {
      let candles: Candle[] = await fetchCandles(ref, days);
      if (from) candles = candles.filter((c) => c.date >= from);
      if (to) candles = candles.filter((c) => c.date <= to);
      data.push({ ref, candles });
      process.stdout.write(`\r  ${data.length}/${refs.length} ${ref.name.padEnd(14)}`);
    } catch (e) {
      console.log(`\n  ✗ ${ref.name} ${(e as Error).message} — 제외`);
    }
    await new Promise((r) => setTimeout(r, 250)); // 네이버 비공식 API 예의상 간격
  }
  console.log(`\n  ✓ ${data.length}종목 확보\n`);

  if (data.length === 0) {
    console.error("✗ 수집된 데이터가 없습니다.");
    process.exit(1);
  }

  const groups = resolveGroups(market, data);
  console.log(`종목군 ${groups.length}개: ${groups.map((g) => `${g.label}(${g.symbols.length})`).join(" · ")}\n`);

  const groupResults = [];
  for (const g of groups) {
    const subset = data.filter((d) => g.symbols.includes(d.ref.symbol));
    console.log(`── ${g.label} (${subset.length}종목) ${"─".repeat(Math.max(0, 44 - g.label.length))}`);

    const variants = [];
    for (const v of VARIANTS) {
      const cfg = clone(base);
      v.apply(cfg);
      const r = runBacktest(subset, cfg);
      variants.push({
        id: v.id,
        label: v.label,
        change: v.change,
        why: v.why,
        config: cfg,
        metrics: r.metrics,
        benchmarkReturnPct: r.benchmarkReturnPct,
        benchmarkMaxDrawdownPct: r.benchmarkMaxDrawdownPct,
        skipped: r.skipped,
        warnings: r.warnings,
        verdicts: verdictLines(r),
        equityCurve: r.equityCurve.map((p) => ({ date: p.date, equity: p.equity })),
        trades: r.trades,
      });
      const m = r.metrics;
      console.log(
        `   ${v.label.padEnd(18)} 수익 ${(m.totalReturnPct >= 0 ? "+" : "") + m.totalReturnPct.toFixed(1)}% · ` +
          `거래 ${String(m.trades).padStart(4)}회 · PF ${m.profitFactor.toFixed(2)} · ` +
          `기대값 ${(m.expectancyR >= 0 ? "+" : "") + m.expectancyR.toFixed(3)}R · ` +
          `MDD -${m.maxDrawdownPct.toFixed(1)}% · 단순보유 ${(r.benchmarkReturnPct >= 0 ? "+" : "") + r.benchmarkReturnPct.toFixed(1)}%`
      );
    }
    groupResults.push({
      id: g.id,
      label: g.label,
      note: g.note ?? null,
      symbols: subset.map((d) => d.ref.name),
      variants,
    });
    console.log("");
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    market,
    days,
    from: from ?? null,
    to: to ?? null,
    symbols: data.map((d) => d.ref.name),
    baseConfig: base,
    groups: groupResults,
  };

  const dir = path.join(STOCK_DATA_DIR, "backtest");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sweep-${market}.json`);
  fs.writeFileSync(file, JSON.stringify(payload), "utf8");

  console.log(`\n저장: ${file}`);
  console.log(`admin [📈 주식] → [백테스트] 탭에서 확인하세요.`);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).stack || e}`);
  process.exit(1);
});
