"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * 백테스트 스윕 뷰어 — `scripts/backtest-sweep.ts` 가 만든 결과를 읽기만 한다.
 * 계산은 여기서 하지 않는다 (수십 초짜리 작업이라 요청 안에서 돌 수 없다).
 *
 * 차트 색은 globals.css 의 --c-series-1..8 을 **선언 순서 그대로** 쓴다.
 * 그 순서가 색약 대비를 통과하도록 잡혀 있으므로 섞으면 안 된다.
 */

type Market = "KR" | "US";

interface Metrics {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  payoffRatio: number;
  profitFactor: number;
  expectancyR: number;
  totalReturnPct: number;
  cagrPct: number;
  /** 양수 크기로 저장된다 — 표시할 때 앞에 "-" 를 붙인다 */
  maxDrawdownPct: number;
  maxDrawdownDays: number;
  sharpe: number;
  avgHoldBars: number;
  totalFees: number;
  feeDragPct: number;
  exitBreakdown: Record<string, number>;
  startDate: string;
  endDate: string;
  years: number;
}

interface Variant {
  id: string;
  label: string;
  change: string;
  why: string;
  config: { capital: number; entry: Record<string, unknown>; exit: Record<string, unknown> };
  metrics: Metrics;
  benchmarkReturnPct: number;
  benchmarkMaxDrawdownPct: number;
  skipped: { noCash: number; slotsFull: number; badStop: number; cooldown: number };
  warnings: string[];
  verdicts: string[];
  equityCurve: Array<{ date: string; equity: number }>;
  tradeCount: number;
}

interface GroupMeta {
  id: string;
  label: string;
  note: string | null;
  symbolCount: number;
}

interface Sweep {
  generatedAt: string;
  market: Market;
  days: number;
  from: string | null;
  to: string | null;
  /** 이 시장에서 고를 수 있는 종목군 전부 */
  groups: GroupMeta[];
  /** 지금 보고 있는 종목군 */
  group: { id: string; label: string; note: string | null; symbols: string[] };
  variants: Variant[];
}

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
  fees: number;
  entrySignals: string[];
}

const EXIT_LABEL: Record<string, string> = {
  stop: "손절",
  target: "익절",
  trail: "트레일링 손절",
  signal: "매도신호",
  maxhold: "보유기간 초과",
  open_at_end: "기간종료",
};

const PAGE_SIZE = 25;

/* ── 포맷 ───────────────────────────────────────────── */

function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function money(v: number, market: Market): string {
  if (!Number.isFinite(v)) return "-";
  return market === "KR"
    ? `${Math.round(v).toLocaleString("ko-KR")}원`
    : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** "20260812" → "26-08-12" (표에 들어가야 해서 연도는 두 자리) */
function shortDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(2, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
}

function fullDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
}

function relTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

const seriesColor = (i: number) => `rgb(var(--c-series-${(i % 8) + 1}))`;

/* ── 비교표 ─────────────────────────────────────────── */

/** 열 정의. dir=1 이면 클수록 좋고, -1 이면 작을수록 좋다 (열별 최고값 표시에 쓴다) */
const COLUMNS: Array<{
  key: string;
  label: string;
  hint: string;
  dir: 1 | -1;
  get: (v: Variant) => number;
  fmt: (v: Variant, market: Market) => string;
}> = [
  {
    key: "trades",
    label: "거래",
    hint: "표본 수. 100회 미만이면 통계가 아니라 우연입니다",
    dir: 1,
    get: (v) => v.metrics.trades,
    fmt: (v) => `${v.metrics.trades}회`,
  },
  {
    key: "win",
    label: "승률",
    hint: "이긴 거래 비율. 손익비가 높으면 승률은 낮아도 됩니다",
    dir: 1,
    get: (v) => v.metrics.winRatePct,
    fmt: (v) => `${v.metrics.winRatePct.toFixed(1)}%`,
  },
  {
    key: "pf",
    label: "PF",
    hint: "Profit Factor = 총이익 ÷ 총손실. 합격 기준 1.3",
    dir: 1,
    get: (v) => v.metrics.profitFactor,
    fmt: (v) => v.metrics.profitFactor.toFixed(2),
  },
  {
    key: "exp",
    label: "기대값",
    hint: "1회 매매의 평균 손익을 리스크(R) 단위로 환산한 값",
    dir: 1,
    get: (v) => v.metrics.expectancyR,
    fmt: (v) => `${v.metrics.expectancyR >= 0 ? "+" : ""}${v.metrics.expectancyR.toFixed(3)}R`,
  },
  {
    key: "ret",
    label: "총수익률",
    hint: "기간 전체 수익률",
    dir: 1,
    get: (v) => v.metrics.totalReturnPct,
    fmt: (v) => pct(v.metrics.totalReturnPct),
  },
  {
    key: "mdd",
    label: "MDD",
    hint: "최대낙폭. 이 구간을 버텨야 결과를 손에 쥡니다. 합격 기준 25% 이내",
    dir: -1,
    get: (v) => v.metrics.maxDrawdownPct,
    fmt: (v) => `-${v.metrics.maxDrawdownPct.toFixed(1)}%`,
  },
  {
    key: "sharpe",
    label: "샤프",
    hint: "변동성 대비 수익. 1 이상이면 곡선이 매끄럽다는 뜻",
    dir: 1,
    get: (v) => v.metrics.sharpe,
    fmt: (v) => v.metrics.sharpe.toFixed(2),
  },
  {
    key: "fee",
    label: "비용비중",
    hint: "수수료+세금이 손익에서 차지하는 비율. 높을수록 거래가 잦다는 신호",
    dir: -1,
    get: (v) => v.metrics.feeDragPct,
    fmt: (v) => `${v.metrics.feeDragPct.toFixed(1)}%`,
  },
];

function ComparisonTable({
  variants,
  market,
  selected,
  onSelect,
}: {
  variants: Variant[];
  market: Market;
  selected: string;
  onSelect: (id: string) => void;
}) {
  // 열마다 최고값을 미리 구해 둔다 — 셀에서 매번 훑으면 O(n²)
  const best = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of COLUMNS) {
      const vals = variants.map(c.get).filter(Number.isFinite);
      if (vals.length) m[c.key] = c.dir === 1 ? Math.max(...vals) : Math.min(...vals);
    }
    return m;
  }, [variants]);

  return (
    <div className="bg-panel border border-line rounded-xl overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-base font-semibold">설정별 성적 비교</h3>
        <p className="text-[11px] text-subtext mt-1">
          같은 일봉 데이터에 설정만 바꿔 돌린 결과입니다. 행을 누르면 아래에 상세가 열립니다.
          <span className="text-good"> 초록 굵은 글씨</span>가 그 열의 최고값입니다.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-y border-line bg-panel2/60">
              <th className="text-left font-medium text-subtext text-[11px] px-4 py-2 whitespace-nowrap">
                설정
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.hint}
                  className="text-right font-medium text-subtext text-[11px] px-3 py-2 whitespace-nowrap cursor-help"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const isSel = v.id === selected;
              return (
                <tr
                  key={v.id}
                  onClick={() => onSelect(v.id)}
                  className={
                    "border-b border-line/60 cursor-pointer transition " +
                    (isSel ? "bg-accent/10" : "hover:bg-panel2/50")
                  }
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: seriesColor(i) }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="font-medium whitespace-nowrap">
                          {v.label}
                          {v.id === "baseline" && (
                            <span className="ml-1.5 text-[10px] text-subtext border border-line rounded px-1 py-0.5">
                              기준
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-subtext mono whitespace-nowrap">
                          {v.change}
                        </div>
                      </div>
                    </div>
                  </td>
                  {COLUMNS.map((c) => {
                    const raw = c.get(v);
                    const isBest = variants.length > 1 && raw === best[c.key];
                    return (
                      <td
                        key={c.key}
                        className={
                          "px-3 py-2.5 text-right mono whitespace-nowrap " +
                          (isBest ? "text-good font-semibold" : "")
                        }
                      >
                        {c.fmt(v, market)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 자산 곡선 ──────────────────────────────────────── */

const CHART_W = 820;
const CHART_H = 280;
const PAD = { top: 12, right: 14, bottom: 24, left: 52 };

function EquityChart({ variants }: { variants: Variant[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 변형들은 같은 일봉을 공유하므로 날짜 축이 같다. 그래도 날짜로 맞춰
  // 조회하도록 해서, 한 변형이 짧아도 선이 어긋나지 않게 한다.
  const { dates, series, yMin, yMax } = useMemo(() => {
    const longest = variants.reduce(
      (a, b) => (b.equityCurve.length > a.equityCurve.length ? b : a),
      variants[0]
    );
    const dates = longest.equityCurve.map((p) => p.date);

    const series = variants.map((v) => {
      const byDate = new Map(v.equityCurve.map((p) => [p.date, p.equity]));
      const capital = v.config.capital;
      let last = 0;
      const values = dates.map((d) => {
        const eq = byDate.get(d);
        if (eq != null) last = ((eq - capital) / capital) * 100;
        return last; // 값이 없는 날은 직전 값을 유지 (계단식)
      });
      return { id: v.id, label: v.label, values, final: values[values.length - 1] ?? 0 };
    });

    // reduce 로 접는다 — 봉이 많아지면 Math.min(...arr) 은 인자 개수 한계에 걸린다
    let lo = 0;
    let hi = 0;
    for (const s of series) {
      for (const v of s.values) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const padY = Math.max(1, (hi - lo) * 0.08);
    return { dates, series, yMin: lo - padY, yMax: hi + padY };
  }, [variants]);

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const x = useCallback(
    (i: number) => PAD.left + (dates.length <= 1 ? 0 : (i / (dates.length - 1)) * plotW),
    [dates.length, plotW]
  );
  const y = useCallback(
    (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH,
    [yMin, yMax, plotH]
  );

  // 눈금은 5% 단위로 떨어지는 "읽기 좋은" 값에 놓는다
  const ticks = useMemo(() => {
    const span = yMax - yMin;
    const step = span > 80 ? 20 : span > 40 ? 10 : span > 16 ? 5 : 2;
    const out: number[] = [];
    for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) out.push(t);
    return out;
  }, [yMin, yMax]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || dates.length === 0) return;
    const ratio = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const i = Math.round(((ratio - PAD.left) / plotW) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  }

  const hoverRows =
    hover == null
      ? []
      : series
          .map((s, i) => ({ ...s, value: s.values[hover], color: seriesColor(i) }))
          .sort((a, b) => b.value - a.value);

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <h3 className="text-base font-semibold">자산 곡선</h3>
      <p className="text-[11px] text-subtext mt-1 mb-3">
        원금 대비 누적 수익률입니다. 끝점의 높이보다 <strong className="text-text">중간에 얼마나 깊이 파였는지</strong>를
        보세요 — 실제로 버텨야 하는 건 그 골짜기입니다.
      </p>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="설정별 누적 수익률 곡선"
      >
        {/* 가로 눈금 — 배경으로 물러나 있어야 한다 */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={CHART_W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="rgb(var(--c-line))"
              strokeWidth={t === 0 ? 1.5 : 1}
              opacity={t === 0 ? 1 : 0.5}
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              className="fill-subtext"
              style={{ fontSize: 10 }}
            >
              {t > 0 ? "+" : ""}
              {t}%
            </text>
          </g>
        ))}

        {/* 날짜 축 — 양 끝과 중간만 */}
        {dates.length > 1 &&
          [0, Math.floor(dates.length / 2), dates.length - 1].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={CHART_H - 6}
              textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}
              className="fill-subtext"
              style={{ fontSize: 10 }}
            >
              {fullDate(dates[i])}
            </text>
          ))}

        {series.map((s, i) => (
          <path
            key={s.id}
            d={s.values.map((v, j) => `${j === 0 ? "M" : "L"}${x(j).toFixed(1)},${y(v).toFixed(1)}`).join("")}
            fill="none"
            stroke={seriesColor(i)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hover != null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="rgb(var(--c-subtext))"
              strokeWidth={1}
              opacity={0.6}
            />
            {series.map((s, i) => (
              <circle
                key={s.id}
                cx={x(hover)}
                cy={y(s.values[hover])}
                r={4}
                fill={seriesColor(i)}
                stroke="rgb(var(--c-panel))"
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </svg>

      {/* 범례 — 색만으로 구분되지 않도록 이름과 최종값을 함께 적는다 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {series.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="w-3 h-[3px] rounded-full shrink-0"
              style={{ background: seriesColor(i) }}
              aria-hidden
            />
            <span className="text-subtext">{s.label}</span>
            <span className="mono text-text">{pct(s.final)}</span>
          </div>
        ))}
      </div>

      {hover != null && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="text-[11px] text-subtext mb-1.5">{fullDate(dates[hover])} 시점</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {hoverRows.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ background: r.color }}
                  aria-hidden
                />
                <span className="text-subtext">{r.label}</span>
                <span className="mono text-text">{pct(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 선택한 설정의 상세 ─────────────────────────────── */

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="bg-panel2/60 border border-line rounded-lg px-3 py-2.5" title={hint}>
      <div className="text-[10px] text-subtext">{label}</div>
      <div className={"text-lg font-semibold mono mt-0.5 " + (tone ?? "")}>{value}</div>
    </div>
  );
}

function VariantDetail({ v, market }: { v: Variant; market: Market }) {
  const m = v.metrics;
  const exits = Object.entries(m.exitBreakdown)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const exitMax = Math.max(1, ...exits.map(([, n]) => n));

  const checks = v.verdicts
    .filter((l) => /^\s*[✅❌]/.test(l))
    .map((l) => ({ ok: l.trimStart().startsWith("✅"), text: l.replace(/^\s*[✅❌]\s*/, "") }));
  const summary = v.verdicts.find((l) => l.trimStart().startsWith("→"))?.trim();

  const skipped: Array<[string, number, string]> = [
    ["현금부족", v.skipped.noCash, "신호는 났지만 살 돈이 없었습니다"],
    ["슬롯참", v.skipped.slotsFull, "이미 최대 종목 수를 들고 있었습니다"],
    ["재진입대기", v.skipped.cooldown, "청산 후 쿨다운 기간이었습니다"],
    ["손절폭 이상", v.skipped.badStop, "ATR 이 없거나 손절선이 계산되지 않았습니다"],
  ];

  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold">{v.label} 상세</h3>
        <p className="text-[11px] text-subtext mt-1">
          <span className="mono text-text">{v.change}</span> — {v.why}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat
          label="총수익률"
          value={pct(m.totalReturnPct)}
          tone={m.totalReturnPct >= 0 ? "text-good" : "text-bad"}
          hint={`연복리 ${pct(m.cagrPct)}`}
        />
        <Stat
          label="단순보유 대비"
          value={pct(m.totalReturnPct - v.benchmarkReturnPct)}
          tone={m.totalReturnPct >= v.benchmarkReturnPct ? "text-good" : "text-bad"}
          hint={`그냥 사서 묻어뒀다면 ${pct(v.benchmarkReturnPct)} (MDD -${v.benchmarkMaxDrawdownPct.toFixed(1)}%)`}
        />
        <Stat
          label="최대낙폭"
          value={`-${m.maxDrawdownPct.toFixed(1)}%`}
          tone={m.maxDrawdownPct <= 25 ? "" : "text-bad"}
          hint={`회복까지 최장 ${m.maxDrawdownDays}일 · 원금 기준 ${money(
            (v.config.capital * m.maxDrawdownPct) / 100,
            market
          )} 이 녹는 구간`}
        />
        <Stat
          label="수수료+세금"
          value={money(m.totalFees, market)}
          tone={m.feeDragPct >= 30 ? "text-bad" : ""}
          hint={`손익의 ${m.feeDragPct.toFixed(1)}%`}
        />
        <Stat label="승 / 패" value={`${m.wins} / ${m.losses}`} hint={`승률 ${m.winRatePct.toFixed(1)}%`} />
        <Stat
          label="평균 수익 / 손실"
          value={`${pct(m.avgWinPct)} / ${pct(m.avgLossPct)}`}
          hint={`손익비 ${m.payoffRatio.toFixed(2)}:1`}
        />
        <Stat label="평균 보유" value={`${m.avgHoldBars.toFixed(1)}봉`} />
        <Stat label="샤프" value={m.sharpe.toFixed(2)} hint="변동성 대비 수익" />
      </div>

      {/* 판정 — 기준은 backtest.ts 의 verdictLines 가 정하고 여기선 표시만 한다.
          verdictLines 는 항목 줄 외에 빈 줄과 "→ 총평" 줄도 함께 돌려주므로 갈라서 그린다. */}
      <div>
        <h4 className="text-xs font-semibold text-subtext mb-1.5">
          판정{" "}
          <span className="font-normal">
            {checks.filter((c) => c.ok).length}/{checks.length} 통과
          </span>
        </h4>
        <ul className="space-y-1">
          {checks.map((c, i) => (
            <li
              key={i}
              className={"text-xs flex gap-1.5 items-start " + (c.ok ? "text-subtext" : "text-bad")}
            >
              <span aria-hidden>{c.ok ? "✅" : "❌"}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
        {summary && <p className="text-xs mt-2 text-text">{summary}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-semibold text-subtext mb-2">청산 사유</h4>
          <div className="space-y-1.5">
            {exits.map(([reason, n]) => (
              <div key={reason} className="flex items-center gap-2 text-[11px]">
                <span className="w-24 shrink-0 text-subtext">{EXIT_LABEL[reason] ?? reason}</span>
                <div className="flex-1 h-2.5 bg-panel2 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-accent"
                    style={{ width: `${(n / exitMax) * 100}%` }}
                  />
                </div>
                <span className="mono w-14 text-right">
                  {n}회 <span className="text-subtext">{((n / m.trades) * 100).toFixed(0)}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-subtext mb-2">
            놓친 신호{" "}
            <span className="font-normal">— 규칙상 진입하지 않은 것이지 버그가 아닙니다</span>
          </h4>
          <div className="space-y-1.5">
            {skipped.map(([label, n, hint]) => (
              <div key={label} className="flex items-center gap-2 text-[11px]" title={hint}>
                <span className="w-24 shrink-0 text-subtext">{label}</span>
                <div className="flex-1 h-2.5 bg-panel2 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-warn"
                    style={{
                      width: `${(n / Math.max(1, ...skipped.map((s) => s[1]))) * 100}%`,
                    }}
                  />
                </div>
                <span className="mono w-14 text-right">{n}회</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {v.warnings.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-3">
          {v.warnings.map((w, i) => (
            <li key={i} className="text-[11px] text-warn">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 매매 내역 (페이징) ─────────────────────────────── */

function TradeTable({
  market,
  groupId,
  variantId,
  total,
}: {
  market: Market;
  groupId: string;
  variantId: string;
  total: number;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Trade[]>([]);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // 설정이나 종목군이 바뀌면 1페이지로 되돌린다 —
  // 안 그러면 7페이지짜리 조합에서 12페이지를 요청하게 된다
  useEffect(() => {
    setPage(1);
  }, [variantId, groupId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(
      `/api/stock/backtest?market=${market}&group=${encodeURIComponent(groupId)}` +
        `&variant=${encodeURIComponent(variantId)}&page=${page}&size=${PAGE_SIZE}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.ok) return;
        setRows(j.trades ?? []);
        setPages(j.pages ?? 1);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [market, groupId, variantId, page]);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <div className="bg-panel border border-line rounded-xl overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">매매 내역</h3>
          <p className="text-[11px] text-subtext mt-1">
            전체 {total.toLocaleString("ko-KR")}건 중 {from}–{to}건
          </p>
        </div>
        <Pager page={page} pages={pages} onChange={setPage} disabled={loading} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-y border-line bg-panel2/60 text-subtext text-[11px]">
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">종목</th>
              <th className="text-left font-medium px-3 py-2 whitespace-nowrap">진입 → 청산</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">보유</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">손익</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">R</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">금액</th>
              <th className="text-left font-medium px-3 py-2 whitespace-nowrap">청산 사유</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">진입 신호</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-subtext">
                  불러오는 중…
                </td>
              </tr>
            )}
            {rows.map((t, i) => {
              const win = t.pnl >= 0;
              return (
                <tr key={`${t.symbol}-${t.entryDate}-${i}`} className="border-b border-line/60">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-subtext mono ml-1.5 text-[10px]">{t.symbol}</span>
                  </td>
                  <td className="px-3 py-2 mono text-subtext whitespace-nowrap">
                    {shortDate(t.entryDate)} → {shortDate(t.exitDate)}
                  </td>
                  <td className="px-3 py-2 mono text-right text-subtext">{t.holdBars}봉</td>
                  <td
                    className={"px-3 py-2 mono text-right font-semibold " + (win ? "text-good" : "text-bad")}
                  >
                    {pct(t.pnlPct)}
                  </td>
                  <td className={"px-3 py-2 mono text-right " + (win ? "text-good" : "text-bad")}>
                    {t.r >= 0 ? "+" : ""}
                    {t.r.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 mono text-right text-subtext">{money(t.pnl, market)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-subtext">
                    {EXIT_LABEL[t.reason] ?? t.reason}
                  </td>
                  <td className="px-4 py-2 text-subtext text-[10px]">
                    {t.entrySignals.join(" + ") || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 flex justify-end border-t border-line">
        <Pager page={page} pages={pages} onChange={setPage} disabled={loading} />
      </div>
    </div>
  );
}

function Pager({
  page,
  pages,
  onChange,
  disabled,
}: {
  page: number;
  pages: number;
  onChange: (p: number) => void;
  disabled?: boolean;
}) {
  // 현재 페이지 주변만 번호로 보여준다 (12페이지가 넘어가면 다 그릴 이유가 없다)
  const window = useMemo(() => {
    const span = 2;
    const start = Math.max(1, Math.min(page - span, pages - span * 2));
    const end = Math.min(pages, Math.max(page + span, span * 2 + 1));
    const out: number[] = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }, [page, pages]);

  const btn =
    "px-2.5 py-1 text-[11px] rounded border transition disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center gap-1">
      <button
        className={btn + " border-line text-subtext hover:text-text"}
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
      >
        ← 이전
      </button>
      {window.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          disabled={disabled}
          className={
            btn +
            " mono " +
            (p === page
              ? "bg-accent/15 border-accent/50 text-text"
              : "border-line text-subtext hover:text-text")
          }
        >
          {p}
        </button>
      ))}
      <button
        className={btn + " border-line text-subtext hover:text-text"}
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= pages}
      >
        다음 →
      </button>
    </div>
  );
}

/* ── 본체 ───────────────────────────────────────────── */

/**
 * `market` 을 주면 그 시장에 고정되고 자체 시장 버튼은 감춘다 (주식 탭 상단이 이미 고르고 있으므로).
 * null 이면 스스로 고른다 — 상단에서 '전체'를 골랐을 때는 백테스트가 섞일 수 없으니
 * 여기서 한쪽을 정해야 한다.
 */
export default function BacktestBoard({ market: locked = null }: { market?: Market | null }) {
  const [ownMarket, setOwnMarket] = useState<Market>("KR");
  const market = locked ?? ownMarket;
  // null 이면 서버가 첫 번째 종목군('전체')을 고른다. 시장을 바꿀 때마다 null 로 되돌려서
  // 국내에 없는 종목군 id('index' 같은)를 그대로 들고 가 404 나는 일을 막는다.
  const [groupId, setGroupId] = useState<string | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [selected, setSelected] = useState("baseline");
  const [loading, setLoading] = useState(true);

  function switchMarket(m: Market) {
    setOwnMarket(m);
    setGroupId(null);
  }

  // 상단에서 시장을 바꾸면 종목군도 되돌린다 — 국내에 없는 id 를 들고 가면 404 다
  useEffect(() => {
    setGroupId(null);
  }, [locked]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/stock/backtest?market=${market}${groupId ? `&group=${encodeURIComponent(groupId)}` : ""}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok && j.exists) {
          setSweep(j as Sweep);
          setCommand(null);
          // 선택한 설정이 이 종목군에도 있으면 유지한다 — 종목군을 바꿔가며
          // 같은 설정을 비교하는 게 이 화면의 주 용도라서
          setSelected((prev) =>
            (j.variants as Variant[]).some((v) => v.id === prev) ? prev : (j.variants[0]?.id ?? "baseline")
          );
        } else {
          setSweep(null);
          setCommand(j.command ?? null);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [market, groupId]);

  const current = sweep?.variants.find((v) => v.id === selected) ?? sweep?.variants[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {locked ? (
          <span className="text-[11px] text-subtext">
            {locked === "KR" ? "🇰🇷 국내" : "🇺🇸 미국"} 시장 · 통화가 달라 두 시장을 섞어 돌리지 않습니다
          </span>
        ) : (
          (["KR", "US"] as Market[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMarket(m)}
              className={
                "px-3 py-1.5 text-sm rounded-lg border transition " +
                (market === m
                  ? "bg-accent/15 border-accent/50 text-text"
                  : "bg-panel border-line text-subtext hover:text-text")
              }
            >
              {m === "KR" ? "🇰🇷 국내" : "🇺🇸 미국"}
            </button>
          ))
        )}
        {sweep && (
          <span className="text-[11px] text-subtext ml-auto">
            {fullDate(sweep.variants[0]?.metrics.startDate ?? "")} ~{" "}
            {fullDate(sweep.variants[0]?.metrics.endDate ?? "")} · {relTime(sweep.generatedAt)} 생성
          </span>
        )}
      </div>

      {/* 종목군 — 지수 ETF와 개별주를 한 솥에 넣으면 어느 쪽이 성적을 만들었는지 알 수 없다 */}
      {sweep && sweep.groups.length > 1 && (
        <div className="bg-panel border border-line rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-subtext mr-1">종목군</span>
            {sweep.groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroupId(g.id)}
                title={g.note ?? undefined}
                className={
                  "px-2.5 py-1 text-xs rounded-lg border transition " +
                  (g.id === sweep.group.id
                    ? "bg-accent/15 border-accent/50 text-text"
                    : "bg-panel2 border-line text-subtext hover:text-text")
                }
              >
                {g.label}
                <span className="ml-1 text-[10px] text-subtext">{g.symbolCount}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-subtext mt-2">
            {sweep.group.note && <span className="text-text">{sweep.group.note}. </span>}
            {sweep.group.symbols.join(" · ")}
          </p>
        </div>
      )}

      {loading && <div className="text-sm text-subtext py-10 text-center">불러오는 중…</div>}

      {!loading && !sweep && (
        <div className="bg-panel border border-line rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-subtext">
            {market === "KR" ? "국내" : "미국"} 시장의 스윕 결과가 아직 없습니다. 아래 명령으로 만들고
            새로고침하세요.
          </p>
          <code className="inline-block bg-panel2 border border-line rounded px-3 py-2 text-xs mono">
            {command ?? `cd admin && npx tsx ../scripts/backtest-sweep.ts --market ${market}`}
          </code>
          <p className="text-[11px] text-subtext">
            종목 수에 따라 2~10분 걸립니다. 일봉은 한 번만 받아 모든 설정·종목군이 공유합니다.
          </p>
        </div>
      )}

      {!loading && sweep && current && (
        <>
          <ComparisonTable
            variants={sweep.variants}
            market={market}
            selected={current.id}
            onSelect={setSelected}
          />
          <EquityChart variants={sweep.variants} />
          <VariantDetail v={current} market={market} />
          <TradeTable
            market={market}
            groupId={sweep.group.id}
            variantId={current.id}
            total={current.tradeCount}
          />

          <p className="text-[11px] text-subtext text-center pb-2">
            결과를 새로 뽑으려면{" "}
            <code className="mono bg-panel2 border border-line rounded px-1.5 py-0.5">
              cd admin && npx tsx ../scripts/backtest-sweep.ts --market {market}
            </code>
          </p>
        </>
      )}
    </div>
  );
}
