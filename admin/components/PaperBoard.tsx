"use client";

import { useEffect, useState } from "react";
import { MARKET_FLAG, MARKET_SHORT, type Market } from "./stockTypes";

/**
 * 페이퍼 트레이딩 화면.
 *
 * 백테스트 화면(🧪)이 "과거에 통했나"를 보여준다면 여기는 **"지금도 통하나"** 다.
 * 그래서 두 가지를 엄격히 갈라 놓는다:
 *   기록(보유·실현) — 이미 일어난 가상 매매
 *   예고(매수 후보) — 아직 산 것이 아닌 것
 * 섞어 놓으면 며칠 뒤에 어느 쪽이었는지 구분할 수 없다.
 */

interface Trade {
  symbol: string;
  name: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  reason: string;
  holdBars: number;
  pnl: number;
  pnlPct: number;
  r: number;
  entrySignals: string[];
}

interface OpenPosition {
  symbol: string;
  name: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  unrealizedPct: number;
  unrealizedPnl: number;
  holdBars: number;
  entrySignals: string[];
}

interface Realized {
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

interface Report {
  market: Market;
  startedAt: string;
  asOf: string;
  tradingDays: number;
  universeSize: number;
  todayEntries: Trade[];
  todayExits: Trade[];
  openPositions: OpenPosition[];
  closedTrades: Trade[];
  realized: Realized;
  equityPct: number;
  benchmarkReturnPct: number;
  warnings: string[];
}

interface Candidate {
  symbol: string;
  name: string;
  netScore: number;
  close: number;
  signals: string[];
}

interface Payload {
  started: boolean;
  market: Market;
  initCommand?: string;
  runCommand?: string;
  ranAt?: string | null;
  charter?: {
    startedAt: string;
    universeNote: string;
    universeSize: number;
    config: {
      capital: number;
      entry: { minNetScore: number; maxOpenPositions: number };
      exit: {
        stopLossAtrMult: number;
        takeProfitAtrMult: number;
        trailingAtrMult: number | null;
        maxHoldDays: number;
      };
    };
  };
  report?: Report | null;
  candidates?: Candidate[] | null;
}

const EXIT_LABEL: Record<string, string> = {
  stop: "손절",
  target: "익절",
  trail: "트레일링 손절",
  signal: "매도신호",
  maxhold: "보유기간 초과",
};

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function money(v: number, m: Market): string {
  return m === "KR"
    ? `${Math.round(v).toLocaleString("ko-KR")}원`
    : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fullDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
}

function Cmd({ children }: { children: string }) {
  return (
    <code className="inline-block bg-panel2 border border-line rounded px-2 py-1 text-[11px] mono">
      {children}
    </code>
  );
}

export default function PaperBoard({ market: locked = null }: { market?: Market | null }) {
  const [ownMarket, setOwnMarket] = useState<Market>("KR");
  const market = locked ?? ownMarket;
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/stock/paper?market=${market}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && j.ok && setData(j as Payload))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [market]);

  const r = data?.report ?? null;
  const c = data?.charter;

  return (
    <div className="space-y-4">
      {!locked && (
        <div className="flex items-center gap-2">
          {(["KR", "US"] as Market[]).map((m) => (
            <button
              key={m}
              onClick={() => setOwnMarket(m)}
              className={
                "px-3 py-1.5 text-sm rounded-lg border transition " +
                (market === m
                  ? "bg-accent/15 border-accent/50 text-text"
                  : "bg-panel border-line text-subtext hover:text-text")
              }
            >
              {MARKET_FLAG[m]} {MARKET_SHORT[m]}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="text-sm text-subtext py-10 text-center">불러오는 중…</div>}

      {!loading && data && !data.started && (
        <div className="bg-panel border border-line rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-subtext">
            {MARKET_SHORT[market]} 페이퍼 트레이딩이 아직 시작되지 않았습니다.
          </p>
          <div>
            <Cmd>{data.initCommand ?? ""}</Cmd>
          </div>
          <p className="text-[11px] text-subtext">
            시작하면 그 시점의 종목과 규칙이 <span className="mono">config/paper-{market}.json</span> 에
            얼려집니다.
          </p>
        </div>
      )}

      {!loading && data?.started && c && (
        <>
          {/* 계약서 — 이게 바뀌면 그때부터 다른 실험이다 */}
          <div className="bg-panel border border-line rounded-xl p-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="text-base font-semibold">
                {MARKET_FLAG[market]} {MARKET_SHORT[market]} 페이퍼 트레이딩
              </h3>
              <span className="text-[11px] text-subtext">
                {fullDate(c.startedAt)} 시작
                {r && r.tradingDays > 0 && ` · ${fullDate(r.asOf)} 기준 · 거래일 ${r.tradingDays}일`}
              </span>
            </div>
            <p className="text-[11px] text-subtext mt-1.5">
              {c.universeNote} · 원금 {money(c.config.capital, market)} · 최대 {c.config.entry.maxOpenPositions}종목
              <br />
              규칙 고정: 진입점수 {c.config.entry.minNetScore} · 손절 ATR×{c.config.exit.stopLossAtrMult} · 익절
              ATR×{c.config.exit.takeProfitAtrMult} · 트레일링 {c.config.exit.trailingAtrMult ?? "없음"} · 최대보유{" "}
              {c.config.exit.maxHoldDays}봉
            </p>
            <p className="text-[11px] text-warn mt-2">
              ⚠ 진행 중에는 종목도 규칙도 바꾸지 않습니다 — 바꾸는 순간 검증이 아니라 또 한 번의 튜닝이 됩니다.
            </p>
          </div>

          {r && r.tradingDays === 0 && (
            <div className="bg-panel border border-line rounded-xl p-6 text-center">
              <p className="text-sm">아직 거래일이 지나지 않았습니다 — 출발선에 선 상태입니다.</p>
              <p className="text-[11px] text-subtext mt-1">
                첫 거래일이 지나면 여기에 매매가 쌓입니다.
              </p>
            </div>
          )}

          {r && r.tradingDays > 0 && (
            <>
              {(r.todayEntries.length > 0 || r.todayExits.length > 0) && (
                <div className="bg-panel border border-line rounded-xl p-4">
                  <h4 className="text-sm font-semibold mb-2">오늘 {fullDate(r.asOf)}</h4>
                  <ul className="space-y-1.5 text-xs">
                    {r.todayEntries.map((t, i) => (
                      <li key={`in-${i}`} className="flex flex-wrap items-baseline gap-2">
                        <span className="text-good font-medium">🟢 매수</span>
                        <span className="font-medium">{t.name}</span>
                        <span className="mono text-subtext">
                          {t.shares}주 @ {money(t.entryPrice, market)}
                        </span>
                        <span className="text-subtext text-[10px]">{t.entrySignals.join(" + ")}</span>
                      </li>
                    ))}
                    {r.todayExits.map((t, i) => (
                      <li key={`out-${i}`} className="flex flex-wrap items-baseline gap-2">
                        <span className="text-bad font-medium">🔴 매도</span>
                        <span className="font-medium">{t.name}</span>
                        <span className="mono text-subtext">
                          {t.shares}주 @ {money(t.exitPrice, market)}
                        </span>
                        <span className={"mono " + (t.pnl >= 0 ? "text-good" : "text-bad")}>
                          {pct(t.pnlPct)}
                        </span>
                        <span className="text-subtext text-[10px]">{EXIT_LABEL[t.reason] ?? t.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-panel border border-line rounded-xl p-4">
                  <h4 className="text-sm font-semibold mb-2">보유 {r.openPositions.length}종목</h4>
                  {r.openPositions.length === 0 ? (
                    <p className="text-xs text-subtext">없음 (전액 현금)</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {[...r.openPositions]
                        .sort((a, b) => b.unrealizedPct - a.unrealizedPct)
                        .map((p) => (
                          <li key={p.symbol} className="flex items-baseline gap-2">
                            <span className="font-medium flex-1 truncate">{p.name}</span>
                            <span className="mono text-subtext text-[10px]">
                              {p.shares}주 · {p.holdBars}봉
                            </span>
                            <span
                              className={"mono w-16 text-right " + (p.unrealizedPct >= 0 ? "text-good" : "text-bad")}
                            >
                              {pct(p.unrealizedPct)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div className="bg-panel border border-line rounded-xl p-4">
                  <h4 className="text-sm font-semibold mb-2">
                    실현 성적 <span className="font-normal text-[11px] text-subtext">— 판 것만</span>
                  </h4>
                  {r.realized.trades === 0 ? (
                    <p className="text-xs text-subtext">아직 청산한 거래가 없습니다.</p>
                  ) : (
                    <div className="text-xs space-y-1 mono">
                      <div>
                        거래 {r.realized.trades}회 (승 {r.realized.wins} / 패 {r.realized.losses}) · 승률{" "}
                        {r.realized.winRatePct.toFixed(1)}%
                      </div>
                      <div>
                        PF {r.realized.profitFactor ? r.realized.profitFactor.toFixed(2) : "-"} · 기대값{" "}
                        {r.realized.expectancyR >= 0 ? "+" : ""}
                        {r.realized.expectancyR.toFixed(3)}R
                      </div>
                      <div className={r.realized.totalPnl >= 0 ? "text-good" : "text-bad"}>
                        실현손익 {money(r.realized.totalPnl, market)}
                      </div>
                      {r.realized.trades < 30 && (
                        <div className="text-warn text-[11px] font-sans">
                          ⚠ {r.realized.trades}회 — 30회는 넘겨야 숫자를 읽기 시작할 수 있습니다.
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-line text-xs mono">
                    평가 포함 {pct(r.equityPct)} · 단순보유 {pct(r.benchmarkReturnPct)}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 예고 — 기록과 절대 섞지 않는다 */}
          <div className="bg-panel border border-line rounded-xl p-4">
            <h4 className="text-sm font-semibold">
              다음 거래일 매수 후보 {data.candidates?.length ?? 0}종목{" "}
              <span className="font-normal text-[11px] text-warn">— 아직 산 것이 아닙니다</span>
            </h4>
            {!data.candidates || data.candidates.length === 0 ? (
              <p className="text-xs text-subtext mt-2">규칙을 통과한 종목이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {data.candidates.slice(0, 15).map((x) => (
                  <li key={x.symbol} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{x.name}</span>
                    <span className="mono text-subtext text-[10px]">점수 {x.netScore}</span>
                    <span className="mono text-subtext text-[10px]">
                      {Math.round(x.close).toLocaleString("ko-KR")}
                    </span>
                    <span className="text-subtext text-[10px]">{x.signals.slice(0, 3).join(" + ")}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-subtext mt-2">
              실제로는 슬롯(최대 {c.config.entry.maxOpenPositions}종목)과 현금이 허락하는 만큼만 삽니다.
            </p>
          </div>

          <p className="text-[11px] text-subtext text-center pb-2">
            매일 갱신: <Cmd>{data.runCommand ?? ""}</Cmd>
            {data.ranAt && (
              <span className="block mt-1">마지막 실행 {new Date(data.ranAt).toLocaleString("ko-KR")}</span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
