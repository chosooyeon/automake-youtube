"use client";

/**
 * 데일리 퀘스트 차트 모음 — 외부 차트 라이브러리 없이 SVG/CSS 로만 그린다.
 *
 * 색은 전부 globals.css 의 --c-series-* / --c-heat-* 를 참조한다.
 * 여기에 hex 를 직접 쓰면 다크모드에서 깨진다.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DOW_LABELS,
  TRACKS,
  addDays,
  fromDateStr,
  toDateStr,
  trackColor,
  trackMeta,
  type DayStat,
  type TrackId,
} from "@/lib/quest";

// ---------------------------------------------------------------- 툴팁

interface TipRow {
  color?: string;
  label: string;
  value?: string;
}
interface TipState {
  x: number;
  y: number;
  title: string;
  sub?: string;
  rows: TipRow[];
}

export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback(
    (e: { clientX: number; clientY: number }, content: Omit<TipState, "x" | "y">) => {
      setTip({ x: e.clientX, y: e.clientY, ...content });
    },
    []
  );
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

export function Tooltip({ tip }: { tip: TipState | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // 화면 밖으로 나가지 않게 렌더 직후 한 번 보정한다
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.min(tip.x + 14, window.innerWidth - r.width - 8);
    const top = tip.y + r.height + 20 > window.innerHeight ? tip.y - r.height - 12 : tip.y + 16;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 pointer-events-none rounded-lg border border-line bg-panel shadow-xl px-3 py-2 text-xs min-w-[140px]"
    >
      <div className="font-semibold text-text">{tip.title}</div>
      {tip.sub && <div className="text-subtext mt-0.5">{tip.sub}</div>}
      {tip.rows.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {tip.rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {r.color && (
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: r.color }}
                />
              )}
              <span className="text-subtext flex-1 truncate">{r.label}</span>
              {r.value && <span className="mono text-text tabular-nums">{r.value}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 공통

export function heatColor(s: DayStat | undefined): string {
  if (!s || s.empty) return "rgb(var(--c-heat-0) / 0.45)";
  return `rgb(var(--c-heat-${s.level}))`;
}

function statSub(s: DayStat | undefined): string {
  if (!s || s.empty) return "예정 없음 (쉬는 날)";
  return `${s.done}/${s.planned} 완료 · ${Math.round(s.rate * 100)}%`;
}

/** 히트맵 범례 — 색만으로 의미를 전달하지 않도록 항상 같이 붙인다 */
export function HeatLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-subtext">
      <span>미달성</span>
      {[0, 1, 2, 3, 4].map((l) => (
        <span
          key={l}
          className="w-3 h-3 rounded-sm border border-line/60"
          style={{ background: `rgb(var(--c-heat-${l}))` }}
        />
      ))}
      <span>전부 완료</span>
      <span className="ml-2 flex items-center gap-1.5">
        <span
          className="w-3 h-3 rounded-sm border border-line/60"
          style={{ background: "rgb(var(--c-heat-0) / 0.45)" }}
        />
        쉬는 날
      </span>
    </div>
  );
}

export function TrackLegend({ tracks }: { tracks: TrackId[] }) {
  if (tracks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-subtext mt-3">
      {tracks.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: trackColor(t) }} />
          {trackMeta(t).label}
        </span>
      ))}
    </div>
  );
}

/** 컨테이너 폭을 재서 차트를 늘려준다 (최소폭 미만이면 가로 스크롤) */
function useWidth(minWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(minWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(minWidth, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [minWidth]);
  return { ref, width: w };
}

// ---------------------------------------------------------------- 월 달력 히트맵

export function MonthHeatmap({
  year,
  month,
  stats,
  today,
  selected,
  onSelect,
}: {
  year: number;
  month: number; // 1~12
  stats: Map<string, DayStat>;
  today: string;
  selected?: string;
  onSelect?: (date: string) => void;
}) {
  const { tip, show, hide } = useTooltip();
  const first = new Date(year, month - 1, 1);
  const lead = first.getDay(); // 1일 앞에 채울 빈칸 수
  const lastDay = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: lastDay }, (_, i) =>
      toDateStr(new Date(year, month - 1, i + 1))
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-subtext mb-1">
        {DOW_LABELS.map((d, i) => (
          <div key={d} className={i === 0 ? "text-bad/80" : i === 6 ? "text-accent/80" : ""}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const s = stats.get(date);
          const isToday = date === today;
          const isSel = date === selected;
          const future = date > today;
          /** 3·4 단계는 칸이 진해서 날짜 숫자에 전용 잉크가 필요하다 */
          const dark = Boolean(s && !s.empty && s.level >= 3);
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect?.(date)}
              onMouseEnter={(e) =>
                show(e, {
                  title: `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${DOW_LABELS[fromDateStr(date).getDay()]})`,
                  sub: future && !s?.done ? "아직 오지 않은 날" : statSub(s),
                  rows: [],
                })
              }
              onMouseLeave={hide}
              className={
                "aspect-square rounded-md relative transition text-[11px] flex items-start justify-end p-1 " +
                (isSel
                  ? "ring-2 ring-accent"
                  : isToday
                    ? "ring-2 ring-text/40"
                    : "hover:ring-2 hover:ring-line")
              }
              style={{ background: heatColor(s), opacity: future ? 0.5 : 1 }}
            >
              <span
                className={"mono tabular-nums " + (dark ? "" : "text-subtext")}
                style={dark ? { color: `rgb(var(--c-heat-ink-${s!.level}))` } : undefined}
              >
                {Number(date.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- 연간 잔디

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 22;
const TOP = 16;

export function YearGrass({
  year,
  stats,
  today,
  onSelect,
}: {
  year: number;
  stats: Map<string, DayStat>;
  today: string;
  onSelect?: (date: string) => void;
}) {
  const { tip, show, hide } = useTooltip();

  // 1월 1일이 포함된 주의 일요일부터 12월 31일이 포함된 주의 토요일까지
  const jan1 = `${year}-01-01`;
  const start = addDays(jan1, -fromDateStr(jan1).getDay());
  const dec31 = `${year}-12-31`;
  const end = addDays(dec31, 6 - fromDateStr(dec31).getDay());

  const weeks: string[][] = [];
  for (let d = start; d <= end; ) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(d);
      d = addDays(d, 1);
    }
    weeks.push(week);
  }

  const width = LEFT + weeks.length * STEP;
  const height = TOP + 7 * STEP;

  // 월 라벨 — 그 달의 1일이 들어있는 주 위에 찍는다
  const monthLabels = weeks
    .map((w, wi) => {
      const hit = w.find((d) => d.slice(0, 4) === String(year) && d.slice(8, 10) === "01");
      return hit ? { wi, label: `${Number(hit.slice(5, 7))}월` } : null;
    })
    .filter(Boolean) as { wi: number; label: string }[];

  return (
    <div className="overflow-x-auto pb-1">
      <svg width={width} height={height} role="img" aria-label={`${year}년 일별 달성 히트맵`}>
        {monthLabels.map((m) => (
          <text
            key={m.label}
            x={LEFT + m.wi * STEP}
            y={11}
            fontSize={10}
            fill="rgb(var(--c-subtext))"
          >
            {m.label}
          </text>
        ))}
        {[1, 3, 5].map((dow) => (
          <text
            key={dow}
            x={0}
            y={TOP + dow * STEP + CELL - 2}
            fontSize={10}
            fill="rgb(var(--c-subtext))"
          >
            {DOW_LABELS[dow]}
          </text>
        ))}
        {weeks.map((week, wi) =>
          week.map((date, di) => {
            if (date.slice(0, 4) !== String(year)) return null;
            const s = stats.get(date);
            const future = date > today;
            return (
              <rect
                key={date}
                x={LEFT + wi * STEP}
                y={TOP + di * STEP}
                width={CELL}
                height={CELL}
                rx={2.5}
                fill={heatColor(s)}
                opacity={future ? 0.35 : 1}
                stroke={date === today ? "rgb(var(--c-text) / 0.5)" : "none"}
                strokeWidth={1.5}
                className="cursor-pointer"
                onClick={() => onSelect?.(date)}
                onMouseEnter={(e) =>
                  show(e, {
                    title: date,
                    sub: future && !s?.done ? "아직 오지 않은 날" : statSub(s),
                    rows: [],
                  })
                }
                onMouseLeave={hide}
              />
            );
          })
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- 스택 막대

export interface BarDatum {
  key: string;
  label: string;
  /** 툴팁 제목 (없으면 label) */
  title?: string;
  total: number;
  byTrack: Record<TrackId, number>;
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

export function StackedTrackBars({
  data,
  tracks,
  height = 200,
  minBarWidth = 22,
  labelEvery = 1,
}: {
  data: BarDatum[];
  tracks: TrackId[];
  height?: number;
  minBarWidth?: number;
  /** x 라벨을 n 개마다 하나씩만 (일별 31개일 때 겹침 방지) */
  labelEvery?: number;
}) {
  const { tip, show, hide } = useTooltip();
  const padL = 28;
  const padR = 8;
  const padB = 20;
  const padT = 8;
  const { ref, width } = useWidth(padL + padR + data.length * minBarWidth);

  const max = niceMax(Math.max(1, ...data.map((d) => d.total)));
  const plotH = height - padT - padB;
  const plotW = Math.max(1, width - padL - padR);
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(34, Math.max(6, slot - 6));
  const y = (v: number) => padT + plotH * (1 - v / max);
  const ticks = [0, max / 2, max];

  return (
    <div ref={ref} className="w-full overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label="트랙별 완료 건수">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="rgb(var(--c-line))"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={y(t) + 3}
              fontSize={10}
              textAnchor="end"
              fill="rgb(var(--c-subtext))"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const x = cx - barW / 2;
          const top = y(d.total);
          const rows = tracks
            .filter((t) => d.byTrack[t] > 0)
            .map((t) => ({
              color: trackColor(t),
              label: trackMeta(t).label,
              value: `${d.byTrack[t]}`,
            }));

          let cursor = 0;
          return (
            <g
              key={d.key}
              onMouseEnter={(e) =>
                show(e, {
                  title: d.title ?? d.label,
                  sub: `완료 ${d.total}건`,
                  rows,
                })
              }
              onMouseLeave={hide}
            >
              {/* 막대보다 넓은 히트 영역 */}
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
              <clipPath id={`clip-${d.key}`}>
                <rect
                  x={x}
                  y={top}
                  width={barW}
                  height={Math.max(0, height - padB - top)}
                  rx={4}
                />
              </clipPath>
              <g clipPath={`url(#clip-${d.key})`}>
                {tracks.map((t) => {
                  const v = d.byTrack[t] ?? 0;
                  if (v <= 0) return null;
                  const segH = (plotH * v) / max;
                  const segY = height - padB - cursor - segH;
                  cursor += segH;
                  return (
                    <rect
                      key={t}
                      x={x}
                      // 2px 은 배경색 틈 — 스택 경계가 색 대비 없이도 보이게 한다
                      y={segY + 1}
                      width={barW}
                      height={Math.max(0, segH - 2)}
                      fill={trackColor(t)}
                    />
                  );
                })}
              </g>
              {i % labelEvery === 0 && (
                <text
                  x={cx}
                  y={height - 6}
                  fontSize={10}
                  textAnchor="middle"
                  fill="rgb(var(--c-subtext))"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}

        <line
          x1={padL}
          x2={width - padR}
          y1={height - padB}
          y2={height - padB}
          stroke="rgb(var(--c-line))"
          strokeWidth={1}
        />
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** 트랙별 가로 막대 — 기간 합계 비교용. 값이 직접 라벨로 붙어 색만으로 읽지 않아도 된다 */
export function TrackRankBars({ byTrack }: { byTrack: Record<TrackId, number> }) {
  const rows = TRACKS.map((t) => ({ id: t.id as TrackId, label: t.label, v: byTrack[t.id] ?? 0 }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  if (rows.length === 0) {
    return <div className="text-xs text-subtext py-6 text-center">아직 완료한 퀘스트가 없어요.</div>;
  }
  const max = Math.max(...rows.map((r) => r.v));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-xs">
          <div className="w-24 shrink-0 text-subtext truncate">{r.label}</div>
          <div className="flex-1 h-3 rounded bg-panel2 overflow-hidden">
            <div
              className="h-full rounded"
              style={{ width: `${(r.v / max) * 100}%`, background: trackColor(r.id) }}
            />
          </div>
          <div className="w-8 text-right mono tabular-nums text-text">{r.v}</div>
        </div>
      ))}
    </div>
  );
}
