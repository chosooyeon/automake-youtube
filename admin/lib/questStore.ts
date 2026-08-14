/**
 * 데일리 퀘스트 저장소 (서버 전용).
 *
 *   config/quest-tasks.json   퀘스트 정의 — 커밋됨
 *   config/quest-log.json     완료 기록  — 커밋됨
 *
 * admin/data/ 가 아니라 config/ 에 두는 이유는 stock 과 같다:
 * 비밀이 아니고, 1년치 기록이라 커밋 히스토리로 남는 편이 안전하다.
 * 1년치라도 수백 KB 를 넘지 않아 통째로 읽어 클라이언트에서 집계한다.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG_DIR } from "./paths";
import {
  TRACK_IDS,
  normalizeCheck,
  toDateStr,
  type Quest,
  type QuestCheck,
  type QuestLog,
  type Season,
  type TrackId,
} from "./quest";

const TASKS_FILE = path.join(CONFIG_DIR, "quest-tasks.json");
const LOG_FILE = path.join(CONFIG_DIR, "quest-log.json");
const SEASON_FILE = path.join(CONFIG_DIR, "quest-season.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function newId(): string {
  return "q_" + crypto.randomBytes(4).toString("hex");
}

/**
 * 처음 열었을 때 깔리는 기본 퀘스트.
 *
 * 육아휴직 중에는 시간이 많은 게 아니라 **조각나 있다**. 주 10건짜리 판을 깔면
 * 못 지킨 날이 쌓이고 → 판을 여는 게 불편해지고 → 안 열게 된다. 그게 3개월 이탈의 실제 경로다.
 * 그래서 발행물은 주 4건까지만. 지키는 경험을 먼저 쌓고 나중에 늘린다.
 * 블로그·클립은 시즌2(정부지원금 검색 유입)에서 열기로 해서 여기엔 없다.
 */
function seedTasks(today: string): Quest[] {
  const seed: { name: string; track: TrackId; days: number[]; mini: string }[] = [
    { name: "롱폼 주제 확정 · 대본 작성", track: "youtube", days: [1], mini: "주제 1개만 정해두기" },
    { name: "롱폼 1편 발행", track: "youtube", days: [3], mini: "대본 3줄 쓰기" },
    { name: "숏츠 1개 발행", track: "shorts", days: [2, 5], mini: "소재 1개 찍어두기" },
    { name: "인스타 카드뉴스 1건 발행", track: "instagram", days: [4], mini: "카드 문구 1줄 쓰기" },
    { name: "30분 독서 (인풋)", track: "etc", days: [], mini: "1페이지" },
  ];
  const now = new Date().toISOString();
  return seed.map((s, i) => ({
    id: newId(),
    name: s.name,
    track: s.track,
    days: s.days,
    mini: s.mini,
    order: i,
    startDate: today,
    archivedDate: null,
    createdAt: now,
  }));
}

// ---------- 시즌 ----------

function seedSeason(today: string): Season {
  return { name: "시즌 1 — 자동화로 서브수입 만들기", startDate: today, weeks: 12 };
}

export function loadSeason(): Season {
  if (!fs.existsSync(SEASON_FILE)) {
    const s = seedSeason(toDateStr(new Date()));
    writeJson(SEASON_FILE, s);
    return s;
  }
  const raw = readJson<Partial<Season>>(SEASON_FILE, {});
  const fallback = seedSeason(toDateStr(new Date()));
  return {
    name: raw.name ?? fallback.name,
    startDate: raw.startDate ?? fallback.startDate,
    weeks: Number.isFinite(raw.weeks) && raw.weeks! > 0 ? raw.weeks! : 12,
  };
}

export function saveSeason(patch: Partial<Season>): Season {
  const next = { ...loadSeason(), ...patch };
  writeJson(SEASON_FILE, next);
  return next;
}

function normalize(raw: unknown): Quest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Quest => Boolean(q) && typeof (q as Quest).id === "string")
    .map((q, i) => ({
      id: q.id,
      name: String(q.name ?? ""),
      track: (TRACK_IDS.includes(q.track) ? q.track : "etc") as TrackId,
      days: Array.isArray(q.days) ? q.days.filter((d) => d >= 0 && d <= 6) : [],
      mini: String(q.mini ?? ""),
      order: Number.isFinite(q.order) ? q.order : i,
      startDate: q.startDate ?? "1970-01-01",
      archivedDate: q.archivedDate ?? null,
      createdAt: q.createdAt ?? new Date().toISOString(),
    }))
    .sort((a, b) => a.order - b.order);
}

export function loadTasks(): Quest[] {
  if (!fs.existsSync(TASKS_FILE)) {
    const seeded = seedTasks(toDateStr(new Date()));
    writeJson(TASKS_FILE, seeded);
    return seeded;
  }
  return normalize(readJson<unknown>(TASKS_FILE, []));
}

export function saveTasks(tasks: Quest[]): void {
  writeJson(
    TASKS_FILE,
    tasks.map((q, i) => ({ ...q, order: i }))
  );
}

export function addTask(input: {
  name: string;
  track: TrackId;
  days: number[];
  mini?: string;
  startDate: string;
}): Quest[] {
  const tasks = loadTasks();
  tasks.push({
    id: newId(),
    name: input.name,
    track: input.track,
    days: input.days,
    mini: input.mini ?? "",
    order: tasks.length,
    startDate: input.startDate,
    archivedDate: null,
    createdAt: new Date().toISOString(),
  });
  saveTasks(tasks);
  return tasks;
}

export function updateTask(
  id: string,
  patch: Partial<Pick<Quest, "name" | "track" | "days" | "mini" | "archivedDate">>
): Quest[] {
  const tasks = loadTasks();
  const t = tasks.find((q) => q.id === id);
  if (t) Object.assign(t, patch);
  saveTasks(tasks);
  return tasks;
}

/** 순서 변경 — id 배열 순서대로 order 를 다시 매긴다 */
export function reorderTasks(ids: string[]): Quest[] {
  const tasks = loadTasks();
  const rank = new Map(ids.map((id, i) => [id, i]));
  tasks.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  saveTasks(tasks);
  return tasks;
}

/** 완전 삭제 — 정의와 그동안의 완료 기록을 같이 지운다 */
export function deleteTask(id: string): Quest[] {
  const tasks = loadTasks().filter((q) => q.id !== id);
  saveTasks(tasks);

  const log = loadLog();
  let touched = false;
  for (const date of Object.keys(log)) {
    if (log[date][id]) {
      delete log[date][id];
      if (Object.keys(log[date]).length === 0) delete log[date];
      touched = true;
    }
  }
  if (touched) saveLog(log);

  return tasks;
}

// ---------- 완료 기록 ----------

export function loadLog(): QuestLog {
  const raw = readJson<Record<string, Record<string, unknown>>>(LOG_FILE, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  // 초기 버전은 값이 ISO 문자열이었다 — 읽는 쪽에서 흡수한다
  const out: QuestLog = {};
  for (const [date, entries] of Object.entries(raw)) {
    if (!entries || typeof entries !== "object") continue;
    const day: Record<string, QuestCheck> = {};
    for (const [taskId, v] of Object.entries(entries)) {
      const c = normalizeCheck(v);
      if (c) day[taskId] = c;
    }
    if (Object.keys(day).length) out[date] = day;
  }
  return out;
}

export function saveLog(log: QuestLog): void {
  writeJson(LOG_FILE, log);
}

export function setCheck(
  date: string,
  taskId: string,
  done: boolean,
  mini = false
): QuestLog {
  const log = loadLog();
  if (done) {
    const check: QuestCheck = mini
      ? { at: new Date().toISOString(), mini: true }
      : { at: new Date().toISOString() };
    log[date] = { ...(log[date] ?? {}), [taskId]: check };
  } else if (log[date]) {
    delete log[date][taskId];
    if (Object.keys(log[date]).length === 0) delete log[date];
  }
  saveLog(log);
  return log;
}
