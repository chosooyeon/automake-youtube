/**
 * 페이퍼 트레이딩 — 실시간 신호를 가상 체결로 기록한다.
 *
 * 백테스트가 "과거에 통했나"를 답했다면 여기는 **"지금도 통하나"** 를 답한다.
 * 백테스트로 얻을 수 있는 건 대체로 다 얻었고(STOCK-TRADING 8-8), 남은 불확실성은
 * 과거를 더 파서 풀리는 게 아니라 앞으로의 데이터로만 풀린다.
 *
 * ── 왜 '재생(replay)' 방식인가 ────────────────────────────────
 * 매일 어제 상태를 파일에서 읽어 오늘 판정을 이어붙이는 방식(증분)이 자연스러워 보이지만,
 * 그러려면 진입·청산·수량 로직을 backtest.ts 와 **한 벌 더** 쓰게 된다.
 * 그 순간 두 구현이 갈라지고, 백테스트로 검증한 규칙과 실제로 기록되는 매매가 달라진다.
 * 이 저장소가 계속 피해 온 실패 모드가 정확히 그것이다.
 *
 * 그래서 여기서는 **시작일부터 오늘까지를 매번 통째로 다시 굴린다.**
 * 과거 일봉은 바뀌지 않으므로 재생 결과는 항상 같고, 규칙은 backtest.ts 하나뿐이다.
 * 상태 파일이 없으니 상태가 썩을 일도 없다 — 언제든 다시 만들 수 있다.
 *
 * ── 얼려두는 것 (charter) ─────────────────────────────────────
 * 페이퍼 트레이딩이 의미를 가지려면 **도중에 규칙이나 종목을 바꾸면 안 된다.**
 * 바꾸는 순간 그건 검증이 아니라 또 한 번의 튜닝이다. 그래서 시작 시점의
 * 종목 목록과 설정을 config/paper-{market}.json 에 얼려서 커밋해 둔다.
 */

import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../paths";
import type { Market, StockRef } from "./naver";
import type { BacktestResult, SymbolData, Trade } from "./backtest";
import { runBacktest } from "./backtest";
import { analyze } from "./signals";
import type { TradingConfig } from "./tradingConfig";

/** runBacktest 가 종목을 버리는 기준(`warmupBars + 5`)과 같아야 한다 */
const MIN_BARS_MARGIN = 6;

/** 시작할 때 얼려두는 계약서. 이 파일이 바뀌면 그 시점부터 다른 실험이다 */
export interface PaperCharter {
  market: Market;
  /** YYYYMMDD — 이 날 이후의 봉만 매매 대상이 된다 */
  startedAt: string;
  /** 어떻게 고른 종목인지 (기록용) */
  universeNote: string;
  universe: StockRef[];
  /** 시작 시점 규칙 스냅샷. config/stock-trading.json 을 나중에 고쳐도 여기는 안 바뀐다 */
  config: TradingConfig;
  note: string;
}

export interface OpenPosition {
  symbol: string;
  name: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  /** 마지막 종가 기준 평가손익률 % (미실현) */
  unrealizedPct: number;
  unrealizedPnl: number;
  holdBars: number;
  entrySignals: string[];
}

/** 실현 거래만으로 다시 센 성적 — 보유 중인 종목의 평가손익은 섞지 않는다 */
export interface RealizedStats {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  expectancyR: number;
  totalPnl: number;
  totalFees: number;
}

export interface PaperReport {
  market: Market;
  startedAt: string;
  /** 데이터가 있는 마지막 거래일 */
  asOf: string;
  tradingDays: number;
  universeSize: number;
  /** 오늘 새로 산 것 / 판 것 — 매일 확인할 유일한 줄 */
  todayEntries: Trade[];
  todayExits: Trade[];
  openPositions: OpenPosition[];
  closedTrades: Trade[];
  realized: RealizedStats;
  /** 평가액 포함 자산 곡선 (미실현 반영) */
  equityCurve: Array<{ date: string; equity: number }>;
  equityPct: number;
  benchmarkReturnPct: number;
  skipped: BacktestResult["skipped"];
  warnings: string[];
}

/** 아직 산 게 아니라 "규칙상 살 자격이 있는" 종목 — 다음 거래일 매수 후보 */
export interface EntryCandidate {
  symbol: string;
  name: string;
  netScore: number;
  close: number;
  signals: string[];
}

/**
 * 마지막 종가 기준으로 진입 조건을 통과하는 종목을 미리 본다.
 *
 * 조건은 backtest.ts 의 진입 판정과 **똑같이** 맞춰야 한다 (netScore ≥ minNetScore,
 * requireUptrend 면 uptrend_filter 신호 필요). 여기가 갈라지면 화면에 뜬 후보와
 * 실제 기록되는 매매가 달라져서 미리보기가 거짓말이 된다.
 *
 * 슬롯·현금 한도는 적용하지 않는다 — 그건 다음 날 시가에 실제로 체결할 때 갈리는 것이라,
 * 여기서 미리 자르면 "왜 후보였는데 안 샀지"를 설명할 수 없게 된다.
 */
export function previewEntryCandidates(cfg: TradingConfig, data: SymbolData[]): EntryCandidate[] {
  const out: EntryCandidate[] = [];
  for (const s of data) {
    if (s.candles.length <= cfg.warmupBars) continue;
    const dec = analyze(s.candles);
    if (dec.insufficientData) continue;
    if (dec.netScore < cfg.entry.minNetScore) continue;
    if (cfg.entry.requireUptrend && !dec.signals.some((g) => g.id === "uptrend_filter")) continue;
    out.push({
      symbol: s.ref.symbol,
      name: s.ref.name,
      netScore: dec.netScore,
      close: s.candles[s.candles.length - 1].close,
      signals: dec.signals.filter((g) => g.kind === "primary" && g.side === "buy").map((g) => g.label),
    });
  }
  return out.sort((a, b) => b.netScore - a.netScore || a.name.localeCompare(b.name));
}

export function paperCharterFile(market: Market): string {
  return path.join(CONFIG_DIR, `paper-${market}.json`);
}

export function loadPaperCharter(market: Market): PaperCharter | null {
  try {
    return JSON.parse(fs.readFileSync(paperCharterFile(market), "utf8")) as PaperCharter;
  } catch {
    return null;
  }
}

export function savePaperCharter(charter: PaperCharter): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(paperCharterFile(charter.market), JSON.stringify(charter, null, 2), "utf8");
}

function pctOf(t: Trade): number {
  return t.pnlPct;
}

function computeRealized(closed: Trade[]): RealizedStats {
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const avg = (arr: Trade[]) => (arr.length ? arr.reduce((a, t) => a + pctOf(t), 0) / arr.length : 0);
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: closed.length ? (wins.length / closed.length) * 100 : 0,
    avgWinPct: avg(wins),
    avgLossPct: avg(losses),
    // 손실이 0이면 PF 는 무한대라 의미가 없다 — 0 으로 두고 표본 부족으로 읽게 한다
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : 0,
    expectancyR: closed.length ? closed.reduce((a, t) => a + t.r, 0) / closed.length : 0,
    totalPnl: closed.reduce((a, t) => a + t.pnl, 0),
    totalFees: closed.reduce((a, t) => a + t.fees, 0),
  };
}

/**
 * 시작일부터 오늘까지 재생한다.
 *
 * `full` 에는 **시작일 이전 봉도 들어 있어야 한다** — SMA60·ATR14 워밍업에 쓰인다.
 * 워밍업 구간에서는 진입하지 않으므로 시작일 전에 매매가 생기지는 않는다.
 */
export function runPaper(charter: PaperCharter, full: SymbolData[]): PaperReport {
  const cfg = charter.config;

  const sliced: SymbolData[] = full.map((s) => {
    const startIdx = s.candles.findIndex((c) => c.date >= charter.startedAt);
    if (startIdx < 0) return { ref: s.ref, candles: [] };
    const from = Math.max(0, startIdx - cfg.warmupBars);
    return { ref: s.ref, candles: s.candles.slice(from) };
  });

  const usable = sliced.filter((s) => s.candles.length > cfg.warmupBars + MIN_BARS_MARGIN);

  // 시작일 이후 봉이 아직 하나도 없는 경우 (장 열리기 전에 돌렸거나, 시작일이 미래).
  // 에러가 아니라 정상 상태다 — "출발선에 섰고 아직 아무 일도 없다"가 맞는 보고다.
  if (usable.length === 0) {
    return {
      market: charter.market,
      startedAt: charter.startedAt,
      asOf: charter.startedAt,
      tradingDays: 0,
      universeSize: full.length,
      todayEntries: [],
      todayExits: [],
      openPositions: [],
      closedTrades: [],
      realized: computeRealized([]),
      equityCurve: [],
      equityPct: 0,
      benchmarkReturnPct: 0,
      skipped: { noCash: 0, slotsFull: 0, badStop: 0, cooldown: 0 },
      warnings: [`시작일(${charter.startedAt}) 이후 거래일이 아직 없습니다.`],
    };
  }

  const result = runBacktest(usable, cfg);

  const dates = [...new Set(usable.flatMap((s) => s.candles.map((c) => c.date)))]
    .filter((d) => d >= charter.startedAt)
    .sort();
  const asOf = dates[dates.length - 1] ?? charter.startedAt;

  // runBacktest 는 기간 끝에 남은 포지션을 'open_at_end' 로 강제 청산해 trades 에 넣는다.
  // 페이퍼에서는 그게 '아직 들고 있는 것'이므로 갈라낸다 — 평가손익을 실현손익과
  // 섞으면 아직 팔지도 않은 이익으로 성적표가 부풀려진다.
  const openTrades = result.trades.filter((t) => t.reason === "open_at_end");
  const closedTrades = result.trades.filter((t) => t.reason !== "open_at_end");

  const openPositions: OpenPosition[] = openTrades.map((t) => ({
    symbol: t.symbol,
    name: t.name,
    entryDate: t.entryDate,
    entryPrice: t.entryPrice,
    shares: t.shares,
    unrealizedPct: t.pnlPct,
    unrealizedPnl: t.pnl,
    holdBars: t.holdBars,
    entrySignals: t.entrySignals,
  }));

  return {
    market: charter.market,
    startedAt: charter.startedAt,
    asOf,
    tradingDays: dates.length,
    universeSize: usable.length,
    todayEntries: result.trades.filter((t) => t.entryDate === asOf),
    todayExits: closedTrades.filter((t) => t.exitDate === asOf),
    openPositions,
    closedTrades,
    realized: computeRealized(closedTrades),
    equityCurve: result.equityCurve.map((p) => ({ date: p.date, equity: p.equity })),
    equityPct: ((result.equityCurve.at(-1)?.equity ?? cfg.capital) / cfg.capital - 1) * 100,
    benchmarkReturnPct: result.benchmarkReturnPct,
    skipped: result.skipped,
    warnings: result.warnings,
  };
}

const money = (v: number, m: Market) =>
  m === "KR"
    ? `${Math.round(v).toLocaleString("ko-KR")}원`
    : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/** 매일 읽을 한 화면. 텔레그램에도 같은 본문을 쓴다 */
export function formatPaperReport(r: PaperReport): string {
  const L: string[] = [];
  const line = "─".repeat(52);

  L.push(line);
  L.push(`페이퍼 트레이딩 · ${r.market}   ${r.startedAt} 시작 → ${r.asOf}`);
  L.push(`거래일 ${r.tradingDays}일 · 종목 ${r.universeSize}개`);
  L.push(line);

  if (r.tradingDays === 0) {
    L.push("");
    L.push("아직 거래일이 지나지 않았습니다 — 출발선에 선 상태입니다.");
    L.push(line);
    return L.join("\n");
  }

  if (r.tradingDays <= 1 && r.realized.trades === 0 && r.openPositions.length === 0) {
    L.push("");
    L.push("첫날인데 규칙에 맞는 신호가 없었습니다 — 아무것도 안 사는 것도 판단입니다.");
    L.push("");
  }

  if (r.todayEntries.length || r.todayExits.length) {
    L.push("");
    L.push(`[오늘 ${r.asOf}]`);
    for (const t of r.todayEntries) {
      L.push(`  🟢 매수  ${t.name} ${t.shares}주 @ ${money(t.entryPrice, r.market)}  ${t.entrySignals.join("+") || "-"}`);
    }
    for (const t of r.todayExits) {
      L.push(
        `  🔴 매도  ${t.name} ${t.shares}주 @ ${money(t.exitPrice, r.market)}  ` +
          `${pct(t.pnlPct)} (${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R) · ${t.reason}`
      );
    }
  } else if (r.tradingDays > 1) {
    L.push("");
    L.push(`[오늘 ${r.asOf}]  매매 없음`);
  }

  L.push("");
  L.push(`[보유 ${r.openPositions.length}종목]`);
  if (r.openPositions.length === 0) {
    L.push("  없음 (전액 현금)");
  } else {
    for (const p of [...r.openPositions].sort((a, b) => b.unrealizedPct - a.unrealizedPct)) {
      L.push(
        `  ${p.name.padEnd(14)} ${String(p.shares).padStart(4)}주 · ${p.holdBars}봉 · ` +
          `평가 ${pct(p.unrealizedPct)} (${money(p.unrealizedPnl, r.market)})`
      );
    }
  }

  const s = r.realized;
  L.push("");
  L.push(`[실현 성적] — 판 것만 센다`);
  if (s.trades === 0) {
    L.push("  아직 청산한 거래가 없습니다.");
  } else {
    L.push(`  거래 ${s.trades}회 (승 ${s.wins} / 패 ${s.losses}) · 승률 ${s.winRatePct.toFixed(1)}%`);
    L.push(`  평균수익 ${pct(s.avgWinPct)} / 평균손실 ${pct(s.avgLossPct)}`);
    L.push(
      `  PF ${s.profitFactor ? s.profitFactor.toFixed(2) : "-"} · ` +
        `기대값 ${s.expectancyR >= 0 ? "+" : ""}${s.expectancyR.toFixed(3)}R`
    );
    L.push(`  실현손익 ${money(s.totalPnl, r.market)} (비용 ${money(s.totalFees, r.market)})`);
  }

  L.push("");
  L.push(`[평가 포함]  자산 ${pct(r.equityPct)} · 같은 종목 단순보유 ${pct(r.benchmarkReturnPct)}`);

  if (s.trades > 0 && s.trades < 30) {
    L.push("");
    L.push(`  ⚠ 실현 ${s.trades}회 — 30회는 넘겨야 숫자를 읽기 시작할 수 있습니다.`);
  }

  L.push(line);
  return L.join("\n");
}
