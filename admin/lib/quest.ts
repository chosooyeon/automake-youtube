/**
 * 데일리 퀘스트 — 타입과 순수 계산 함수.
 *
 * fs 를 쓰지 않으므로 클라이언트 컴포넌트에서도 import 할 수 있다.
 * 파일 입출력은 questStore.ts (서버 전용).
 *
 * 설계 메모
 * - 로그는 "완료한 것만" 기록한다(date → taskId → 체크한 시각).
 *   미완료는 기록하지 않고, 예정(분모)은 퀘스트 정의에서 매번 다시 계산한다.
 * - 그래서 퀘스트에 startDate / archivedDate 가 있다.
 *   오늘 만든 퀘스트 때문에 지난 1월이 통째로 "미달성"으로 물드는 걸 막는다.
 */

export const TRACKS = [
  { id: "youtube", label: "유튜브 롱폼", emoji: "🎬" },
  { id: "shorts", label: "유튜브 숏츠", emoji: "⚡" },
  { id: "instagram", label: "인스타 카드", emoji: "🟪" },
  { id: "blog", label: "네이버 블로그", emoji: "📝" },
  { id: "clip", label: "네이버 클립", emoji: "📱" },
  { id: "emoticon", label: "이모티콘", emoji: "🎨" },
  { id: "cinema", label: "시나리오", emoji: "🎭" },
  { id: "etc", label: "기타 · 루틴", emoji: "🧩" },
] as const;

export type TrackId = (typeof TRACKS)[number]["id"];

export const TRACK_IDS = TRACKS.map((t) => t.id) as readonly TrackId[];

export function trackMeta(id: TrackId) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[TRACKS.length - 1];
}

/**
 * 트랙 색 = globals.css 의 --c-series-1..8.
 * 순서가 곧 접근성 장치다(dataviz 검증: 인접쌍 CVD ΔE 9.1 light / 8.4 dark).
 * 트랙을 재정렬하면 인접쌍이 바뀌므로 순서를 함부로 섞지 않는다.
 */
export function trackColor(id: TrackId): string {
  const i = TRACKS.findIndex((t) => t.id === id);
  return `rgb(var(--c-series-${(i < 0 ? TRACKS.length - 1 : i) + 1}))`;
}

export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export interface Quest {
  id: string;
  name: string;
  track: TrackId;
  /** 반복 요일 0(일)~6(토). 빈 배열이면 매일 */
  days: number[];
  /**
   * 최소 버전. 컨디션이 안 좋은 날엔 이것만 해도 완료로 친다.
   * 0을 하는 날과 1을 하는 날의 차이가 1과 10의 차이보다 크다 — 판을 계속 여는 게 핵심.
   */
  mini: string;
  /** 정렬 순서 (작을수록 위) */
  order: number;
  /** "YYYY-MM-DD" — 이 날짜부터 집계 대상 */
  startDate: string;
  /** "YYYY-MM-DD" — 이 날짜부터 집계 제외 (보관). null 이면 진행중 */
  archivedDate: string | null;
  createdAt: string;
}

export interface QuestCheck {
  /** 체크한 시각 (ISO) */
  at: string;
  /** 미니 버전으로 완료했는지. 달성률/스트릭에는 똑같이 완료로 센다 */
  mini?: boolean;
}

/** date("YYYY-MM-DD") → taskId → 체크. 키가 있으면 완료. */
export type QuestLog = Record<string, Record<string, QuestCheck>>;

/** 초기 버전은 값이 ISO 문자열이었다. 읽을 때 조용히 흡수한다 */
export function normalizeCheck(v: unknown): QuestCheck | null {
  if (typeof v === "string") return { at: v };
  if (v && typeof v === "object" && typeof (v as QuestCheck).at === "string") {
    const c = v as QuestCheck;
    return c.mini ? { at: c.at, mini: true } : { at: c.at };
  }
  return null;
}

export function checkOf(log: QuestLog, date: string, taskId: string): QuestCheck | null {
  return normalizeCheck(log[date]?.[taskId]);
}

// ---------- 날짜 ----------

/** Date → "YYYY-MM-DD" (로컬 시간 기준. UTC 로 자르면 한국 밤에 하루가 밀린다) */
export function toDateStr(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "YYYY-MM-DD" → 로컬 자정 Date */
export function fromDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(s: string, delta: number): string {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

/** 요일 0(일)~6(토) */
export function dowOf(date: string): number {
  return fromDateStr(date).getDay();
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** from~to 포함 구간의 날짜 문자열 배열 */
export function rangeDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > 4000) break; // 안전장치
  }
  return out;
}

export function monthRange(year: number, month1: number): { from: string; to: string } {
  const mm = `${month1}`.padStart(2, "0");
  const last = new Date(year, month1, 0).getDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${`${last}`.padStart(2, "0")}` };
}

/**
 * 달성률을 낼 때 쓰는 구간 끝.
 * 아직 오지 않은 날을 분모에 넣으면 8월에 보는 연간 달성률이 늘 처참하게 나온다.
 */
export function clampToToday(to: string, today: string): string {
  return to < today ? to : today;
}

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ---------- 예정 / 완료 판정 ----------

/** 그 날 이 퀘스트가 예정되어 있었나 (기간 + 요일) */
export function isScheduled(q: Quest, date: string): boolean {
  if (date < q.startDate) return false;
  if (q.archivedDate && date >= q.archivedDate) return false;
  return q.days.length === 0 || q.days.includes(dowOf(date));
}

export function questsForDate(tasks: Quest[], date: string): Quest[] {
  return tasks.filter((q) => isScheduled(q, date)).sort((a, b) => a.order - b.order);
}

export function isDone(log: QuestLog, date: string, taskId: string): boolean {
  return Boolean(checkOf(log, date, taskId));
}

export interface DayStat {
  date: string;
  planned: number;
  done: number;
  /** done 중 미니 버전으로 채운 개수 */
  miniDone: number;
  /** 0~1. planned 가 0 이면 0 */
  rate: number;
  /** 0(예정없음) 1~4(달성 구간). 히트맵 색 단계 */
  level: 0 | 1 | 2 | 3 | 4;
  /** 예정이 아예 없는 날 (쉬는 날) — 미달성과 구분해서 그린다 */
  empty: boolean;
}

export function dayStat(tasks: Quest[], log: QuestLog, date: string): DayStat {
  const planned = tasks.reduce((n, q) => n + (isScheduled(q, date) ? 1 : 0), 0);
  if (planned === 0) {
    return { date, planned: 0, done: 0, miniDone: 0, rate: 0, level: 0, empty: true };
  }
  let done = 0;
  let miniDone = 0;
  for (const q of tasks) {
    if (!isScheduled(q, date)) continue;
    const c = checkOf(log, date, q.id);
    if (!c) continue;
    done++;
    if (c.mini) miniDone++;
  }
  const rate = done / planned;
  // 삼등분. 0.67 같은 근사값을 쓰면 2/3(=0.6666…) 이 한 칸 아래로 떨어진다
  const level: DayStat["level"] =
    done === 0 ? 0 : rate >= 1 ? 4 : rate >= 2 / 3 ? 3 : rate >= 1 / 3 ? 2 : 1;
  return { date, planned, done, miniDone, rate, level, empty: false };
}

/**
 * 현재 연속 달성일.
 * - 예정이 없는 날(쉬는 날)은 건너뛴다 — 일요일 쉰다고 스트릭이 끊기면 안 된다.
 * - 오늘은 아직 진행 중일 수 있으므로, 미완이어도 끊지 않고 어제부터 이어 센다.
 */
export function currentStreak(tasks: Quest[], log: QuestLog, today: string): number {
  let streak = 0;
  let d = today;
  for (let i = 0; i < 800; i++) {
    const s = dayStat(tasks, log, d);
    if (!s.empty) {
      if (s.done >= s.planned) streak++;
      else if (d !== today) break;
    }
    d = addDays(d, -1);
  }
  return streak;
}

/** 구간 내 최장 연속 달성일 */
export function bestStreak(tasks: Quest[], log: QuestLog, from: string, to: string): number {
  let best = 0;
  let run = 0;
  for (const d of rangeDates(from, to)) {
    const s = dayStat(tasks, log, d);
    if (s.empty) continue;
    if (s.done >= s.planned) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}

export interface RangeSummary {
  planned: number;
  done: number;
  /** done 중 미니 버전으로 채운 개수 */
  miniDone: number;
  /** 예정이 있었던 날 수 */
  activeDays: number;
  /** 100% 채운 날 수 */
  perfectDays: number;
  /** 0~1 */
  rate: number;
  /** 트랙별 완료 건수 */
  byTrack: Record<TrackId, number>;
}

export function summarize(
  tasks: Quest[],
  log: QuestLog,
  from: string,
  to: string
): RangeSummary {
  const byTrack = Object.fromEntries(TRACK_IDS.map((t) => [t, 0])) as Record<TrackId, number>;
  let planned = 0;
  let done = 0;
  let miniDone = 0;
  let activeDays = 0;
  let perfectDays = 0;

  for (const date of rangeDates(from, to)) {
    const s = dayStat(tasks, log, date);
    if (s.empty) continue;
    activeDays++;
    planned += s.planned;
    done += s.done;
    miniDone += s.miniDone;
    if (s.done >= s.planned) perfectDays++;
    for (const q of tasks) {
      if (isScheduled(q, date) && isDone(log, date, q.id)) byTrack[q.track] += 1;
    }
  }

  return {
    planned,
    done,
    miniDone,
    activeDays,
    perfectDays,
    rate: planned ? done / planned : 0,
    byTrack,
  };
}

/** 월별(1~12) × 트랙별 완료 건수 — 연간 누적 막대용 */
export function byMonthAndTrack(
  tasks: Quest[],
  log: QuestLog,
  year: number
): { month: number; total: number; byTrack: Record<TrackId, number> }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const { from, to } = monthRange(year, i + 1);
    const s = summarize(tasks, log, from, to);
    return { month: i + 1, total: s.done, byTrack: s.byTrack };
  });
}

/** 일별 × 트랙별 완료 건수 — 월간 막대용 */
export function byDayAndTrack(
  tasks: Quest[],
  log: QuestLog,
  from: string,
  to: string
): { date: string; total: number; byTrack: Record<TrackId, number> }[] {
  return rangeDates(from, to).map((date) => {
    const byTrack = Object.fromEntries(TRACK_IDS.map((t) => [t, 0])) as Record<TrackId, number>;
    let total = 0;
    for (const q of tasks) {
      if (isScheduled(q, date) && isDone(log, date, q.id)) {
        byTrack[q.track] += 1;
        total++;
      }
    }
    return { date, total, byTrack };
  });
}

/** 기록 표(이름 / 날짜 / 완성여부) 한 줄 */
export interface LogRow {
  date: string;
  taskId: string;
  name: string;
  track: TrackId;
  done: boolean;
  mini: boolean;
  doneAt: string | null;
}

export function logRows(tasks: Quest[], log: QuestLog, from: string, to: string): LogRow[] {
  const rows: LogRow[] = [];
  for (const date of rangeDates(from, to)) {
    for (const q of questsForDate(tasks, date)) {
      const c = checkOf(log, date, q.id);
      rows.push({
        date,
        taskId: q.id,
        name: q.name,
        track: q.track,
        done: Boolean(c),
        mini: Boolean(c?.mini),
        doneAt: c?.at ?? null,
      });
    }
  }
  // 최신 날짜가 위로
  return rows.reverse();
}

// ---------- 코치 메시지 ----------

/**
 * 오늘 이전에 연속으로 놓친 날 수 (쉬는 날은 건너뛴다).
 * "두 번 연속은 안 빠진다" 규칙의 판정 근거.
 */
export function missedRun(tasks: Quest[], log: QuestLog, today: string): number {
  let run = 0;
  let d = addDays(today, -1);
  for (let i = 0; i < 400; i++) {
    const s = dayStat(tasks, log, d);
    if (!s.empty) {
      if (s.done >= s.planned) break;
      run++;
    }
    d = addDays(d, -1);
  }
  return run;
}

export interface Coach {
  tone: "cheer" | "warn" | "info";
  title: string;
  body?: string;
}

/**
 * 상황에 맞는 한 줄.
 *
 * 원칙: 못 한 걸 지적하지 않는다. 다음 한 걸음만 제시한다.
 * 무너지는 건 하루 빠져서가 아니라 이틀 연속 빠질 때다.
 */
export function coachMessage(
  tasks: Quest[],
  log: QuestLog,
  today: string,
  streak: number
): Coach {
  const s = dayStat(tasks, log, today);

  if (s.empty) {
    return {
      tone: "info",
      title: "오늘은 쉬는 날이에요 🌿",
      body: "예정된 퀘스트가 없습니다. 쉬는 것도 계획이에요.",
    };
  }

  if (s.done >= s.planned) {
    const milestone =
      streak >= 100 ? "100일" : streak >= 30 ? "30일" : streak >= 14 ? "2주" : streak >= 7 ? "일주일" : null;
    if (milestone) {
      return {
        tone: "cheer",
        title: `${milestone} 연속입니다 🎉`,
        body: `오늘까지 ${streak}일. 이쯤 되면 의지가 아니라 습관이에요.`,
      };
    }
    return {
      tone: "cheer",
      title: "오늘 다 채웠어요 ✨",
      body:
        streak > 1
          ? `${streak}일 연속. 내일도 미니 하나면 이어집니다.`
          : "판을 다시 열었네요. 이게 제일 중요한 거예요.",
    };
  }

  const missed = missedRun(tasks, log, today);
  const left = s.planned - s.done;

  // 큰 숫자는 격려가 아니라 처벌이다. 일주일이 넘어가면 일수를 말하지 않는다
  if (missed >= 7) {
    return {
      tone: "warn",
      title: "오랜만이에요. 다시 시작하면 됩니다",
      body: "그동안의 기록은 그대로 있어요. 오늘의 목표는 판을 다시 여는 것 하나뿐입니다.",
    };
  }

  if (missed >= 2) {
    return {
      tone: "warn",
      title: `${missed}일 쉬었어요. 다시 시작하면 됩니다`,
      body: "오늘의 목표는 판을 다시 여는 것 하나예요. 미니 버전 하나면 충분합니다.",
    };
  }

  if (missed === 1) {
    return {
      tone: "warn",
      title: "어제는 넘어갔어요. 괜찮습니다",
      body: "무너지는 건 하루 빠져서가 아니라 이틀 연속일 때예요. 오늘은 미니 버전이라도 하나만.",
    };
  }

  if (s.done > 0) {
    return {
      tone: "info",
      title: `${s.done}개 했어요. ${left}개 남았습니다`,
      body: "힘들면 남은 건 미니 버전으로 넘겨도 완료입니다.",
    };
  }

  return {
    tone: "info",
    title: `오늘 ${s.planned}개 예정되어 있어요`,
    body: streak > 0 ? `${streak}일 연속 중입니다. 가장 쉬운 것부터 하나.` : "가장 쉬운 것부터 하나만 열어보세요.",
  };
}

// ---------- 시즌 ----------

export interface Season {
  name: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** 시즌 길이 (주) */
  weeks: number;
}

export interface SeasonProgress {
  /** 1부터. 시즌 시작 전이면 0 */
  week: number;
  weeks: number;
  /** 0~1 */
  pct: number;
  endDate: string;
  daysLeft: number;
  /** 중간 지점(절반)을 지난 주에 들어섰는지 */
  isMidpoint: boolean;
  midWeek: number;
  ended: boolean;
}

export function seasonProgress(season: Season, today: string): SeasonProgress {
  const totalDays = season.weeks * 7;
  const endDate = addDays(season.startDate, totalDays - 1);
  const elapsed = rangeDates(season.startDate, today).length - 1; // 시작일 = 0일차
  const day = Math.max(0, Math.min(totalDays, today < season.startDate ? 0 : elapsed + 1));
  const week = day === 0 ? 0 : Math.ceil(day / 7);
  const midWeek = Math.ceil(season.weeks / 2);
  return {
    week,
    weeks: season.weeks,
    pct: Math.max(0, Math.min(1, day / totalDays)),
    endDate,
    daysLeft: Math.max(0, totalDays - day),
    isMidpoint: week === midWeek,
    midWeek,
    ended: today > endDate,
  };
}

export function daysLabel(days: number[]): string {
  if (days.length === 0) return "매일";
  if (days.length === 7) return "매일";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === "1,2,3,4,5") return "평일";
  if (sorted.join() === "0,6") return "주말";
  return sorted.map((d) => DOW_LABELS[d]).join("·");
}
