"use client";

/**
 * 데일리 퀘스트 — 하루 체크 → 월/년 누적을 한 화면에서 본다.
 *
 * 데이터는 마운트 때 한 번 통째로 받고(/api/quest) 집계는 전부 클라이언트에서 한다.
 * 1년치라도 수백 KB 라, 뷰를 옮길 때마다 서버를 왕복하는 것보다 이쪽이 빠르다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import IdeaBoard from "./IdeaBoard";
import {
  HeatLegend,
  MonthHeatmap,
  StackedTrackBars,
  TrackLegend,
  TrackRankBars,
  YearGrass,
  type BarDatum,
} from "./QuestCharts";
import {
  DOW_LABELS,
  TRACKS,
  TRACK_IDS,
  addDays,
  bestStreak,
  byDayAndTrack,
  byMonthAndTrack,
  checkOf,
  clampToToday,
  coachMessage,
  currentStreak,
  dayStat,
  daysLabel,
  fromDateStr,
  logRows,
  monthRange,
  questsForDate,
  rangeDates,
  seasonProgress,
  summarize,
  toDateStr,
  trackColor,
  trackMeta,
  type Coach,
  type DayStat,
  type Quest,
  type QuestLog,
  type Season,
  type TrackId,
} from "@/lib/quest";

type View = "today" | "month" | "year" | "log" | "manage" | "ideas";

const VIEWS: { id: View; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "month", label: "월간" },
  { id: "year", label: "연간" },
  { id: "log", label: "기록 표" },
  { id: "manage", label: "퀘스트 관리" },
  { id: "ideas", label: "💡 아이디어 파킹" },
];

export default function QuestBoard() {
  const { push } = useToast();
  const [tasks, setTasks] = useState<Quest[]>([]);
  const [log, setLog] = useState<QuestLog>({});
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");

  /** 로컬 오늘. SSR/CSR 불일치를 피하려 마운트 후에 정한다 */
  const [today, setToday] = useState("");
  const [day, setDay] = useState(""); // 오늘 뷰에서 보고 있는 날짜
  const [ym, setYm] = useState({ y: 0, m: 0 });
  const [year, setYear] = useState(0);

  useEffect(() => {
    const t = toDateStr(new Date());
    setToday(t);
    setDay(t);
    setYm({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) });
    setYear(Number(t.slice(0, 4)));

    fetch("/api/quest", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setTasks(d.tasks ?? []);
          setLog(d.log ?? {});
          setSeason(d.season ?? null);
        }
      })
      .catch(() => push({ kind: "error", title: "퀘스트를 불러오지 못했습니다" }))
      .finally(() => setLoading(false));
  }, [push]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archivedDate), [tasks]);

  const toggle = useCallback(
    async (date: string, taskId: string, next: boolean, mini = false) => {
      // 낙관적 업데이트 — 체크는 즉각 반응해야 습관이 된다
      setLog((prev) => {
        const copy: QuestLog = { ...prev, [date]: { ...(prev[date] ?? {}) } };
        if (next) {
          copy[date][taskId] = mini
            ? { at: new Date().toISOString(), mini: true }
            : { at: new Date().toISOString() };
        } else delete copy[date][taskId];
        if (Object.keys(copy[date]).length === 0) delete copy[date];
        return copy;
      });

      try {
        const r = await fetch("/api/quest/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date, taskId, done: next, mini }),
        });
        const d = await r.json();
        if (!d?.ok) throw new Error(d?.message ?? "저장 실패");
        setLog(d.log);
      } catch {
        push({ kind: "error", title: "저장 실패", message: "체크가 반영되지 않았습니다." });
        // 서버 상태로 되돌린다
        const r = await fetch("/api/quest", { cache: "no-store" }).then((x) => x.json());
        if (r?.ok) setLog(r.log ?? {});
      }
    },
    [push]
  );

  if (loading || !today) {
    return <div className="text-sm text-subtext py-10 text-center">불러오는 중…</div>;
  }

  return (
    <div className="space-y-4">
      {season && <SeasonBar season={season} today={today} onChange={setSeason} />}

      <div className="flex flex-wrap items-center gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={
              "px-3 py-1.5 text-sm rounded-lg border transition " +
              (view === v.id
                ? "bg-accent/15 border-accent/50 text-text"
                : "bg-panel border-line text-subtext hover:text-text")
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "today" && (
        <TodayView
          tasks={activeTasks}
          log={log}
          today={today}
          date={day}
          setDate={setDay}
          onToggle={toggle}
        />
      )}
      {view === "month" && (
        <MonthView
          tasks={tasks}
          log={log}
          today={today}
          ym={ym}
          setYm={setYm}
          onPickDate={(d) => {
            setDay(d);
            setView("today");
          }}
        />
      )}
      {view === "year" && (
        <YearView
          tasks={tasks}
          log={log}
          today={today}
          year={year}
          setYear={setYear}
          onPickDate={(d) => {
            setDay(d);
            setView("today");
          }}
        />
      )}
      {view === "log" && <LogTableView tasks={tasks} log={log} today={today} />}
      {view === "manage" && (
        <ManageView tasks={tasks} today={today} onChange={setTasks} onReloadLog={setLog} />
      )}
      {view === "ideas" && <IdeaBoard />}
    </div>
  );
}

// ================================================================ 시즌 진행바

function SeasonBar({
  season,
  today,
  onChange,
}: {
  season: Season;
  today: string;
  onChange: (s: Season) => void;
}) {
  const { push } = useToast();
  const [edit, setEdit] = useState(false);
  const p = useMemo(() => seasonProgress(season, today), [season, today]);

  const save = async (patch: Partial<Season>) => {
    try {
      const r = await fetch("/api/quest/season", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (!d?.ok) throw new Error("실패");
      onChange(d.season);
      setEdit(false);
    } catch {
      push({ kind: "error", title: "시즌 저장 실패" });
    }
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold truncate">{season.name}</h2>
          <button
            onClick={() => setEdit((v) => !v)}
            className="text-[11px] text-subtext hover:text-text shrink-0"
          >
            수정
          </button>
        </div>
        <div className="text-xs text-subtext">
          {p.ended ? (
            <span className="text-accent">시즌 종료 · 회고할 시간이에요</span>
          ) : p.week === 0 ? (
            <>시작 전 · {season.startDate} 부터</>
          ) : (
            <>
              <span className="text-text font-semibold mono">{p.week}</span>
              <span className="mono">/{p.weeks}</span> 주차 · {p.daysLeft}일 남음 ({p.endDate}까지)
            </>
          )}
        </div>
      </div>

      {/* 진행바 — 중간 지점에 눈금을 찍어 "언제 꺾이는지" 미리 보이게 한다 */}
      <div className="relative h-2.5 rounded-full bg-panel2 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${p.pct * 100}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-text/35"
          style={{ left: `${(p.midWeek / p.weeks) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-subtext mt-1">
        <span>1주차</span>
        <span>{p.midWeek}주차 · 중간점검</span>
        <span>{p.weeks}주차</span>
      </div>

      {p.isMidpoint && !p.ended && (
        <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs">
          <div className="font-semibold">중간 지점입니다 ({p.midWeek}주차)</div>
          <div className="text-subtext mt-1 leading-relaxed">
            12주는 길어서 여기쯤 한 번 꺾여요. 정상입니다. 지금 볼 건 딱 셋 —{" "}
            <b className="text-text">달성률이 60% 아래면 퀘스트를 줄이고</b>, 시즌 후보 3개가 그대로인지
            확인하고, 남은 6주에 하나만 더합니다.
          </div>
        </div>
      )}

      {edit && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <Field label="시즌 이름">
            <input
              className="input-base w-64"
              defaultValue={season.name}
              onBlur={(e) => e.target.value.trim() && save({ name: e.target.value })}
            />
          </Field>
          <Field label="시작일">
            <input
              type="date"
              className="input-base w-40"
              defaultValue={season.startDate}
              onChange={(e) => e.target.value && save({ startDate: e.target.value })}
            />
          </Field>
          <Field label="길이 (주)">
            <input
              type="number"
              min={1}
              max={104}
              className="input-base w-24"
              defaultValue={season.weeks}
              onBlur={(e) => Number(e.target.value) > 0 && save({ weeks: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// ================================================================ 코치 배너

function CoachBanner({ coach }: { coach: Coach }) {
  const cls =
    coach.tone === "cheer"
      ? "border-accent/40 bg-accent/10"
      : coach.tone === "warn"
        ? "border-warn/40 bg-warn/5"
        : "border-line bg-panel2";
  return (
    <div className={"rounded-lg border px-3.5 py-3 mb-4 " + cls}>
      <div className="text-sm font-semibold">{coach.title}</div>
      {coach.body && <div className="text-xs text-subtext mt-1 leading-relaxed">{coach.body}</div>}
    </div>
  );
}

// ================================================================ 오늘

function TodayView({
  tasks,
  log,
  today,
  date,
  setDate,
  onToggle,
}: {
  tasks: Quest[];
  log: QuestLog;
  today: string;
  date: string;
  setDate: (d: string) => void;
  onToggle: (date: string, taskId: string, next: boolean, mini?: boolean) => void;
}) {
  const list = useMemo(() => questsForDate(tasks, date), [tasks, date]);
  const stat = useMemo(() => dayStat(tasks, log, date), [tasks, log, date]);
  const streak = useMemo(() => currentStreak(tasks, log, today), [tasks, log, today]);
  const coach = useMemo(
    () => coachMessage(tasks, log, today, streak),
    [tasks, log, today, streak]
  );

  const last14 = useMemo(() => {
    const from = addDays(today, -13);
    return rangeDates(from, today).map((d) => dayStat(tasks, log, d));
  }, [tasks, log, today]);

  const grouped = useMemo(() => {
    const m = new Map<TrackId, Quest[]>();
    for (const q of list) m.set(q.track, [...(m.get(q.track) ?? []), q]);
    return TRACK_IDS.filter((t) => m.has(t)).map((t) => ({ track: t, items: m.get(t)! }));
  }, [list]);

  const dow = DOW_LABELS[fromDateStr(date).getDay()];
  const isToday = date === today;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-panel border border-line rounded-xl p-4">
        {/* 코치 한 줄은 오늘 날짜를 보고 있을 때만. 지난 날을 들출 땐 잔소리가 된다 */}
        {isToday && <CoachBanner coach={coach} />}

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(addDays(date, -1))}
              className="px-2 py-1 rounded border border-line text-subtext hover:text-text"
            >
              ←
            </button>
            <div>
              <div className="text-base font-semibold">
                {date.slice(0, 4)}. {Number(date.slice(5, 7))}. {Number(date.slice(8, 10))} ({dow})
              </div>
              <div className="text-xs text-subtext">
                {isToday ? "오늘" : date < today ? "지난 날 · 소급 체크 가능" : "예정"}
              </div>
            </div>
            <button
              onClick={() => setDate(addDays(date, 1))}
              className="px-2 py-1 rounded border border-line text-subtext hover:text-text"
            >
              →
            </button>
            {!isToday && (
              <button
                onClick={() => setDate(today)}
                className="ml-1 px-2 py-1 rounded border border-line text-xs text-subtext hover:text-text"
              >
                오늘로
              </button>
            )}
          </div>
          <ProgressRing done={stat.done} planned={stat.planned} />
        </div>

        {list.length === 0 ? (
          <div className="text-sm text-subtext py-10 text-center">
            이 날엔 예정된 퀘스트가 없어요. 쉬는 날입니다 🌿
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ track, items }) => (
              <div key={track}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: trackColor(track) }} />
                  <span className="text-xs text-subtext">
                    {trackMeta(track).emoji} {trackMeta(track).label}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items.map((q) => {
                    const c = checkOf(log, date, q.id);
                    const done = Boolean(c);
                    return (
                      <div
                        key={q.id}
                        className={
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg border transition " +
                          (c?.mini
                            ? "bg-accent/5 border-accent/30 border-dashed"
                            : done
                              ? "bg-accent/10 border-accent/40"
                              : "bg-panel2 border-line hover:border-subtext/50")
                        }
                      >
                        <button
                          onClick={() => onToggle(date, q.id, !done)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <span
                            className={
                              "w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center text-[11px] " +
                              (done
                                ? "bg-accent border-accent text-panel"
                                : "border-subtext/50 text-transparent")
                            }
                          >
                            ✓
                          </span>
                          <span className="flex-1 min-w-0">
                            <span
                              className={
                                "block text-sm truncate " +
                                (done ? "text-subtext line-through" : "text-text")
                              }
                            >
                              {q.name}
                            </span>
                            {q.mini && !done && (
                              <span className="block text-[11px] text-subtext mt-0.5">
                                최소 버전 · {q.mini}
                              </span>
                            )}
                          </span>
                        </button>

                        {/* 힘든 날의 탈출구. 이게 있어야 0인 날이 안 생긴다 */}
                        {!done && q.mini && (
                          <button
                            onClick={() => onToggle(date, q.id, true, true)}
                            title={`최소 버전으로 완료: ${q.mini}`}
                            className="shrink-0 px-2 py-1 rounded-md border border-dashed border-accent/50 text-[11px] text-accent hover:bg-accent/10"
                          >
                            미니로 완료
                          </button>
                        )}
                        <span className="text-[11px] text-subtext mono shrink-0">
                          {c ? (c.mini ? `미니 ${c.at.slice(11, 16)}` : c.at.slice(11, 16)) : daysLabel(q.days)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="text-xs text-subtext mb-1">연속 달성</div>
          <div className="text-3xl font-bold">
            {streak}
            <span className="text-base font-normal text-subtext ml-1">일</span>
          </div>
          <div className="text-[11px] text-subtext mt-1">
            쉬는 날(예정 없는 날)은 스트릭을 끊지 않아요.
          </div>
        </div>

        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="text-xs text-subtext mb-2">최근 14일</div>
          <div className="flex gap-1">
            {last14.map((s) => (
              <div
                key={s.date}
                title={`${s.date} · ${s.empty ? "쉬는 날" : `${s.done}/${s.planned}`}`}
                className="flex-1 h-8 rounded-sm"
                style={{
                  background: s.empty
                    ? "rgb(var(--c-heat-0) / 0.45)"
                    : `rgb(var(--c-heat-${s.level}))`,
                }}
              />
            ))}
          </div>
          <div className="mt-3">
            <HeatLegend />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ done, planned }: { done: number; planned: number }) {
  const pct = planned ? done / planned : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width={64} height={64} className="-rotate-90">
        <circle cx={32} cy={32} r={r} fill="none" stroke="rgb(var(--c-panel2))" strokeWidth={7} />
        <circle
          cx={32}
          cy={32}
          r={r}
          fill="none"
          stroke="rgb(var(--c-accent))"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div>
        <div className="text-2xl font-bold mono tabular-nums">
          {done}
          <span className="text-subtext text-base">/{planned}</span>
        </div>
        <div className="text-xs text-subtext">{Math.round(pct * 100)}% 완료</div>
      </div>
    </div>
  );
}

// ================================================================ KPI

function Kpi({
  label,
  value,
  unit,
  hint,
  accent = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 " + (accent ? "bg-accent/10 border-accent/40" : "bg-panel2 border-line")
      }
    >
      <div className="text-[11px] text-subtext">{label}</div>
      <div className="text-xl font-bold mono tabular-nums mt-0.5">
        {value}
        {unit && <span className="text-sm font-normal text-subtext ml-0.5">{unit}</span>}
      </div>
      {hint && <div className="text-[10px] text-subtext mt-0.5">{hint}</div>}
    </div>
  );
}

function statsMap(tasks: Quest[], log: QuestLog, from: string, to: string): Map<string, DayStat> {
  return new Map(rangeDates(from, to).map((d) => [d, dayStat(tasks, log, d)]));
}

/** 값이 0 이 아닌 트랙만 범례에 올린다 (색 8개를 항상 다 보여줄 이유가 없다) */
function usedTracks(byTrack: Record<TrackId, number>): TrackId[] {
  return TRACK_IDS.filter((t) => (byTrack[t] ?? 0) > 0);
}

// ================================================================ 월간

function MonthView({
  tasks,
  log,
  today,
  ym,
  setYm,
  onPickDate,
}: {
  tasks: Quest[];
  log: QuestLog;
  today: string;
  ym: { y: number; m: number };
  setYm: (v: { y: number; m: number }) => void;
  onPickDate: (d: string) => void;
}) {
  const { from, to } = monthRange(ym.y, ym.m);
  // 달력·막대는 달 전체를 그리지만, 달성률은 오늘까지만 센다
  const til = clampToToday(to, today);
  const stats = useMemo(() => statsMap(tasks, log, from, to), [tasks, log, from, to]);
  const sum = useMemo(() => summarize(tasks, log, from, til), [tasks, log, from, til]);
  const best = useMemo(() => bestStreak(tasks, log, from, til), [tasks, log, from, til]);

  const bars: BarDatum[] = useMemo(
    () =>
      byDayAndTrack(tasks, log, from, to).map((d) => ({
        key: d.date,
        label: String(Number(d.date.slice(8, 10))),
        title: `${Number(d.date.slice(5, 7))}월 ${Number(d.date.slice(8, 10))}일`,
        total: d.total,
        byTrack: d.byTrack,
      })),
    [tasks, log, from, to]
  );

  const shift = (delta: number) => {
    const d = new Date(ym.y, ym.m - 1 + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  return (
    <div className="space-y-4">
      <Nav
        title={`${ym.y}년 ${ym.m}월`}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onNow={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) })}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="달성률" value={Math.round(sum.rate * 100)} unit="%" accent />
        <Kpi
          label="완료 건수"
          value={sum.done}
          unit={`/${sum.planned}`}
          hint={sum.miniDone > 0 ? `미니 ${sum.miniDone}건 포함` : undefined}
        />
        <Kpi label="완주한 날" value={sum.perfectDays} unit={`/${sum.activeDays}일`} hint="예정 100% 채운 날" />
        <Kpi label="이 달 최장 연속" value={best} unit="일" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-panel border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">일별 달성률</h3>
          <MonthHeatmap
            year={ym.y}
            month={ym.m}
            stats={stats}
            today={today}
            onSelect={onPickDate}
          />
          <div className="mt-3">
            <HeatLegend />
          </div>
          <div className="text-[11px] text-subtext mt-2">날짜를 누르면 그 날 체크리스트로 이동해요.</div>
        </div>

        <div className="bg-panel border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">트랙별 완료 건수 (합계)</h3>
          <TrackRankBars byTrack={sum.byTrack} />
        </div>
      </div>

      <div className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">일별 · 트랙별 완료</h3>
        <StackedTrackBars data={bars} tracks={usedTracks(sum.byTrack)} labelEvery={2} minBarWidth={20} />
        <TrackLegend tracks={usedTracks(sum.byTrack)} />
      </div>
    </div>
  );
}

// ================================================================ 연간

function YearView({
  tasks,
  log,
  today,
  year,
  setYear,
  onPickDate,
}: {
  tasks: Quest[];
  log: QuestLog;
  today: string;
  year: number;
  setYear: (y: number) => void;
  onPickDate: (d: string) => void;
}) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const til = clampToToday(to, today);
  const stats = useMemo(() => statsMap(tasks, log, from, to), [tasks, log, from, to]);
  const sum = useMemo(() => summarize(tasks, log, from, til), [tasks, log, from, til]);
  const best = useMemo(() => bestStreak(tasks, log, from, til), [tasks, log, from, til]);

  const bars: BarDatum[] = useMemo(
    () =>
      byMonthAndTrack(tasks, log, year).map((m) => ({
        key: `m${m.month}`,
        label: `${m.month}`,
        title: `${year}년 ${m.month}월`,
        total: m.total,
        byTrack: m.byTrack,
      })),
    [tasks, log, year]
  );

  return (
    <div className="space-y-4">
      <Nav
        title={`${year}년`}
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
        onNow={() => setYear(Number(today.slice(0, 4)))}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="연간 달성률" value={Math.round(sum.rate * 100)} unit="%" accent />
        <Kpi
          label="총 완료 건수"
          value={sum.done}
          unit={`/${sum.planned}`}
          hint={sum.miniDone > 0 ? `미니 ${sum.miniDone}건 포함` : undefined}
        />
        <Kpi label="완주한 날" value={sum.perfectDays} unit={`/${sum.activeDays}일`} />
        <Kpi label="최장 연속" value={best} unit="일" />
      </div>

      <div className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">{year}년 달성 잔디</h3>
        <YearGrass year={year} stats={stats} today={today} onSelect={onPickDate} />
        <div className="mt-3">
          <HeatLegend />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-panel border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">월별 · 트랙별 완료</h3>
          <StackedTrackBars data={bars} tracks={usedTracks(sum.byTrack)} minBarWidth={30} />
          <TrackLegend tracks={usedTracks(sum.byTrack)} />
        </div>
        <div className="bg-panel border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">트랙별 완료 건수 (연간 합계)</h3>
          <TrackRankBars byTrack={sum.byTrack} />
        </div>
      </div>
    </div>
  );
}

function Nav({
  title,
  onPrev,
  onNext,
  onNow,
}: {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onNow: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onPrev} className="px-2.5 py-1 rounded border border-line text-subtext hover:text-text">
        ←
      </button>
      <div className="text-base font-semibold min-w-[110px]">{title}</div>
      <button onClick={onNext} className="px-2.5 py-1 rounded border border-line text-subtext hover:text-text">
        →
      </button>
      <button
        onClick={onNow}
        className="px-2.5 py-1 rounded border border-line text-xs text-subtext hover:text-text"
      >
        현재로
      </button>
    </div>
  );
}

// ================================================================ 기록 표

type Period = "week" | "month" | "year" | "all";

function LogTableView({
  tasks,
  log,
  today,
}: {
  tasks: Quest[];
  log: QuestLog;
  today: string;
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [track, setTrack] = useState<TrackId | "all">("all");
  const [status, setStatus] = useState<"all" | "done" | "todo">("all");
  const [limit, setLimit] = useState(120);

  const { from, to } = useMemo(() => {
    if (period === "week") return { from: addDays(today, -6), to: today };
    if (period === "month") return monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
    if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    const earliest = [
      ...tasks.map((t) => t.startDate),
      ...Object.keys(log),
      today,
    ].sort()[0];
    return { from: earliest, to: today };
  }, [period, today, tasks, log]);

  const rows = useMemo(() => {
    let r = logRows(tasks, log, from, to);
    if (track !== "all") r = r.filter((x) => x.track === track);
    if (status === "done") r = r.filter((x) => x.done);
    if (status === "todo") r = r.filter((x) => !x.done);
    return r;
  }, [tasks, log, from, to, track, status]);

  const doneCount = rows.filter((r) => r.done).length;

  const downloadCsv = () => {
    const head = "이름,트랙,날짜,요일,완성여부,완료시각\n";
    const body = rows
      .map((r) =>
        [
          `"${r.name.replace(/"/g, '""')}"`,
          trackMeta(r.track).label,
          r.date,
          DOW_LABELS[fromDateStr(r.date).getDay()],
          r.done ? (r.mini ? "미니완료" : "완료") : "미완료",
          r.doneAt ? r.doneAt.slice(0, 19).replace("T", " ") : "",
        ].join(",")
      )
      .join("\n");
    // BOM 을 붙여야 엑셀에서 한글이 깨지지 않는다
    const blob = new Blob(["﻿" + head + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quest-log_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="기간">
          <select
            className="input-base w-32"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as Period);
              setLimit(120);
            }}
          >
            <option value="week">최근 7일</option>
            <option value="month">이번 달</option>
            <option value="year">올해</option>
            <option value="all">전체</option>
          </select>
        </Field>
        <Field label="트랙">
          <select
            className="input-base w-36"
            value={track}
            onChange={(e) => setTrack(e.target.value as TrackId | "all")}
          >
            <option value="all">전체</option>
            {TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="상태">
          <select
            className="input-base w-28"
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | "done" | "todo")}
          >
            <option value="all">전체</option>
            <option value="done">완료만</option>
            <option value="todo">미완료만</option>
          </select>
        </Field>
        <div className="flex-1" />
        <div className="text-xs text-subtext">
          {from} ~ {to} · <span className="text-text mono">{rows.length}</span>건 (완료{" "}
          <span className="text-accent mono">{doneCount}</span>)
        </div>
        <button
          onClick={downloadCsv}
          className="px-3 py-1.5 text-xs rounded-lg border border-line text-subtext hover:text-text"
        >
          CSV 내보내기
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-subtext border-b border-line">
              <th className="py-2 pr-3 font-medium">이름</th>
              <th className="py-2 pr-3 font-medium w-32">트랙</th>
              <th className="py-2 pr-3 font-medium w-32">날짜</th>
              <th className="py-2 pr-3 font-medium w-24">완성여부</th>
              <th className="py-2 font-medium w-20">완료시각</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={`${r.date}-${r.taskId}`} className="border-b border-line/50">
                <td className="py-2 pr-3">{r.name}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5 text-xs text-subtext">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: trackColor(r.track) }}
                    />
                    {trackMeta(r.track).label}
                  </span>
                </td>
                <td className="py-2 pr-3 mono text-xs tabular-nums text-subtext">
                  {r.date} ({DOW_LABELS[fromDateStr(r.date).getDay()]})
                </td>
                <td className="py-2 pr-3">
                  {r.done ? (
                    r.mini ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-accent/50 bg-accent/10 text-accent">
                        ✓ 미니
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-good/40 bg-good/10 text-good">
                        ✓ 완료
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-line bg-panel2 text-subtext">
                      · 미완료
                    </span>
                  )}
                </td>
                <td className="py-2 mono text-xs tabular-nums text-subtext">
                  {r.doneAt ? r.doneAt.slice(11, 16) : "-"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-subtext text-xs">
                  해당하는 기록이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > limit && (
        <button
          onClick={() => setLimit((n) => n + 200)}
          className="mt-3 w-full py-2 text-xs rounded-lg border border-line text-subtext hover:text-text"
        >
          더 보기 ({rows.length - limit}건 남음)
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] text-subtext mb-1">{label}</div>
      {children}
    </label>
  );
}

// ================================================================ 퀘스트 관리

function ManageView({
  tasks,
  today,
  onChange,
  onReloadLog,
}: {
  tasks: Quest[];
  today: string;
  onChange: (t: Quest[]) => void;
  onReloadLog: (l: QuestLog) => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [track, setTrack] = useState<TrackId>("etc");
  const [days, setDays] = useState<number[]>([]);
  const [mini, setMini] = useState("");
  const [busy, setBusy] = useState(false);

  const active = tasks.filter((t) => !t.archivedDate);
  const archived = tasks.filter((t) => t.archivedDate);

  const call = async (init: RequestInit & { url?: string }) => {
    setBusy(true);
    try {
      const r = await fetch(init.url ?? "/api/quest/tasks", init);
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.message ?? "실패");
      onChange(d.tasks);
      return true;
    } catch (e) {
      push({ kind: "error", title: "저장 실패", message: String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!name.trim()) return;
    const ok = await call({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), track, days, mini: mini.trim(), startDate: today }),
    });
    if (ok) {
      setName("");
      setDays([]);
      setMini("");
      push({ kind: "success", title: "퀘스트 추가됨" });
    }
  };

  const patch = (id: string, body: Record<string, unknown>) =>
    call({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });

  const move = (id: string, delta: number) => {
    const ids = tasks.map((t) => t.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return call({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: ids }),
    });
  };

  const remove = async (q: Quest) => {
    if (
      !confirm(
        `"${q.name}" 을(를) 완전히 삭제할까요?\n지금까지의 완료 기록도 같이 지워집니다.\n\n기록을 남기고 싶다면 [보관] 을 쓰세요.`
      )
    )
      return;
    const ok = await call({ url: `/api/quest/tasks?id=${encodeURIComponent(q.id)}`, method: "DELETE" });
    if (ok) {
      const r = await fetch("/api/quest", { cache: "no-store" }).then((x) => x.json());
      if (r?.ok) onReloadLog(r.log ?? {});
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">퀘스트 추가</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Field label="이름">
              <input
                className="input-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="예) 인스타 카드뉴스 1건 발행"
              />
            </Field>
          </div>
          <Field label="트랙">
            <select
              className="input-base w-40"
              value={track}
              onChange={(e) => setTrack(e.target.value as TrackId)}
            >
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="반복 요일 (아무것도 안 고르면 매일)">
            <DayPicker days={days} onChange={setDays} />
          </Field>
          <div className="flex-1 min-w-[200px]">
            <Field label="최소 버전 (힘든 날 이것만 해도 완료)">
              <input
                className="input-base"
                value={mini}
                onChange={(e) => setMini(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="예) 소재 1개 찍어두기"
              />
            </Field>
          </div>
          <button
            onClick={add}
            disabled={busy || !name.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-panel text-sm font-medium disabled:opacity-40"
          >
            추가
          </button>
        </div>
      </div>

      <div className="bg-panel border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">진행 중 ({active.length})</h3>
        <div className="space-y-2">
          {active.map((q) => (
            <div key={q.id} className="p-2.5 rounded-lg bg-panel2 border border-line space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: trackColor(q.track) }}
                />
                <input
                  className="input-base flex-1 min-w-[180px]"
                  defaultValue={q.name}
                  onBlur={(e) =>
                    e.target.value.trim() !== q.name && patch(q.id, { name: e.target.value })
                  }
                />
                <select
                  className="input-base w-36"
                  value={q.track}
                  onChange={(e) => patch(q.id, { track: e.target.value })}
                >
                  {TRACKS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
                <DayPicker days={q.days} onChange={(d) => patch(q.id, { days: d })} />
                <div className="flex items-center gap-1">
                  <IconBtn title="위로" onClick={() => move(q.id, -1)}>
                    ↑
                  </IconBtn>
                  <IconBtn title="아래로" onClick={() => move(q.id, 1)}>
                    ↓
                  </IconBtn>
                  <IconBtn
                    title="보관 (기록은 남고 오늘 목록에서만 빠짐)"
                    onClick={() => patch(q.id, { archivedDate: today })}
                  >
                    📦
                  </IconBtn>
                  <IconBtn title="완전 삭제" danger onClick={() => remove(q)}>
                    ✕
                  </IconBtn>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-5">
                <span className="text-[11px] text-subtext shrink-0">최소 버전</span>
                <input
                  className="input-base text-xs"
                  defaultValue={q.mini}
                  placeholder="컨디션 나쁜 날 이것만 해도 완료 — 예) 대본 3줄 쓰기"
                  onBlur={(e) => e.target.value !== q.mini && patch(q.id, { mini: e.target.value })}
                />
              </div>
            </div>
          ))}
          {active.length === 0 && (
            <div className="text-xs text-subtext py-6 text-center">진행 중인 퀘스트가 없어요.</div>
          )}
        </div>
      </div>

      {archived.length > 0 && (
        <div className="bg-panel border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-1">보관됨 ({archived.length})</h3>
          <p className="text-[11px] text-subtext mb-3">
            보관한 날 이전 기록은 통계에 그대로 남습니다.
          </p>
          <div className="space-y-2">
            {archived.map((q) => (
              <div
                key={q.id}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-panel2/60 border border-line text-sm"
              >
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: trackColor(q.track) }} />
                <span className="flex-1 text-subtext">{q.name}</span>
                <span className="text-[11px] text-subtext mono">{q.archivedDate} 보관</span>
                <button
                  onClick={() => patch(q.id, { archivedDate: null })}
                  className="px-2 py-1 text-xs rounded border border-line text-subtext hover:text-text"
                >
                  되살리기
                </button>
                <IconBtn title="완전 삭제" danger onClick={() => remove(q)}>
                  ✕
                </IconBtn>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-subtext">
        저장 위치: <span className="mono">config/quest-tasks.json</span> ·{" "}
        <span className="mono">config/quest-log.json</span> (커밋되므로 기록이 git 히스토리로도 남아요)
      </p>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        "w-7 h-7 rounded border border-line text-xs flex items-center justify-center transition " +
        (danger ? "text-subtext hover:text-bad hover:border-bad/50" : "text-subtext hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const toggle = (d: number) =>
    onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  return (
    <div className="flex gap-1">
      {DOW_LABELS.map((label, d) => {
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={
              "w-7 h-7 rounded text-xs border transition " +
              (on
                ? "bg-accent/20 border-accent/50 text-text"
                : "bg-panel border-line text-subtext hover:text-text")
            }
          >
            {label}
          </button>
        );
      })}
      {days.length === 0 && <span className="self-center text-[11px] text-subtext ml-1">매일</span>}
    </div>
  );
}
