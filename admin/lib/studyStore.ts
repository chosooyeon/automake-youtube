/**
 * 공부 노트 저장소 (서버 전용).
 *
 * 내용: config/study/*.json (커밋됨 — 책 본문. 파일 하나가 과목 하나)
 * 복습 상태: config/study-progress.json (커밋됨 — quest-log 와 같은 취급)
 *
 * 과목을 추가하려면 config/study/ 에 json 하나 더 놓으면 된다. 코드 수정 없음.
 * code/text 는 줄 배열로 써도 된다 (JSON 안에서 \n 를 안 치려고) — 여기서 문자열로 합친다.
 */

import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./paths";
import { grade, todayKey, type Block, type Grade, type Progress, type Subject, type TreeNode } from "./study";

const STUDY_DIR = path.join(CONFIG_DIR, "study");
const PROGRESS_FILE = path.join(CONFIG_DIR, "study-progress.json");

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

function joinLines(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join("\n");
  return String(v ?? "");
}

function normalizeTree(raw: Record<string, unknown>): TreeNode {
  return {
    label: String(raw.label ?? ""),
    sub: raw.sub ? joinLines(raw.sub) : undefined,
    children: Array.isArray(raw.children)
      ? (raw.children as Record<string, unknown>[]).map(normalizeTree)
      : undefined,
  };
}

function normalizeBlock(raw: Record<string, unknown>): Block | null {
  const title = raw.title ? String(raw.title) : undefined;
  const note = raw.note ? joinLines(raw.note) : undefined;
  switch (raw.type) {
    case "table":
      return {
        type: "table",
        title,
        note,
        columns: (raw.columns as unknown[]).map(String),
        rows: (raw.rows as unknown[][]).map((r) => r.map(joinLines)),
      };
    case "code":
      return { type: "code", title, note, lang: raw.lang ? String(raw.lang) : "python", code: joinLines(raw.code) };
    case "note":
      return { type: "note", title, text: joinLines(raw.text) };
    case "flow":
      return {
        type: "flow",
        title,
        note,
        steps: (raw.steps as Record<string, unknown>[]).map((s) => ({
          label: String(s.label),
          sub: s.sub ? joinLines(s.sub) : undefined,
        })),
      };
    case "compare":
      return {
        type: "compare",
        title,
        note,
        items: (raw.items as Record<string, unknown>[]).map((it) => ({
          name: String(it.name),
          points: (it.points as unknown[]).map(joinLines),
        })),
      };
    case "tree":
      return { type: "tree", title, note, root: normalizeTree(raw.root as Record<string, unknown>) };
    default:
      return null;
  }
}

function normalizeSubject(raw: Record<string, unknown>, fileStem: string): Subject {
  const chapters = ((raw.chapters as Record<string, unknown>[]) ?? []).map((ch, i) => ({
    id: String(ch.id ?? `ch${i + 1}`),
    title: String(ch.title ?? `${i + 1}장`),
    summary: joinLines(ch.summary),
    blocks: ((ch.blocks as Record<string, unknown>[]) ?? [])
      .map(normalizeBlock)
      .filter((b): b is Block => Boolean(b)),
    cards: ((ch.cards as Record<string, unknown>[]) ?? []).map((c, j) => ({
      id: String(c.id ?? `c${j + 1}`),
      q: joinLines(c.q),
      a: joinLines(c.a),
      hint: c.hint ? joinLines(c.hint) : undefined,
    })),
  }));
  return {
    id: String(raw.id ?? fileStem),
    title: String(raw.title ?? fileStem),
    emoji: String(raw.emoji ?? "📘"),
    intro: joinLines(raw.intro),
    order: Number(raw.order ?? 99),
    chapters,
  };
}

export function loadSubjects(): Subject[] {
  if (!fs.existsSync(STUDY_DIR)) return [];
  return fs
    .readdirSync(STUDY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = readJson<Record<string, unknown> | null>(path.join(STUDY_DIR, f), null);
      return raw ? normalizeSubject(raw, f.replace(/\.json$/, "")) : null;
    })
    .filter((s): s is Subject => Boolean(s))
    .sort((a, b) => a.order - b.order);
}

export function loadProgress(): Progress {
  const raw = readJson<Partial<Progress>>(PROGRESS_FILE, {});
  return { cards: raw.cards && typeof raw.cards === "object" ? raw.cards : {} };
}

export function gradeCard(key: string, g: Grade): Progress {
  const p = loadProgress();
  p.cards[key] = grade(p.cards[key], g, todayKey());
  writeJson(PROGRESS_FILE, p);
  return p;
}

/** 과목(또는 챕터) 복습 기록 초기화 — 처음부터 다시 외우고 싶을 때 */
export function resetProgress(prefix: string): Progress {
  const p = loadProgress();
  for (const k of Object.keys(p.cards)) if (k.startsWith(prefix)) delete p.cards[k];
  writeJson(PROGRESS_FILE, p);
  return p;
}
