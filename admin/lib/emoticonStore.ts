import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT } from "./paths";
import type { MarketId } from "./emoticonMarkets";

/**
 * 이모티콘 프로젝트 저장소.
 * admin/data/emoticons/<projectId>/
 *   meta.json                # 프로젝트 메타
 *   reference/0.png ...       # 사용자 업로드 또는 시안 채택한 reference
 *   output/<index>-<slug>.png # 생성된 이모티콘 (index 는 1부터)
 *
 * data/ 는 .gitignore 됨.
 */

export const EMOTICON_ROOT = path.join(REPO_ROOT, "admin", "data", "emoticons");

export interface EmoticonExpression {
  index: number; // 1-based
  label: string; // ex. "안녕"
  prompt: string; // 이미지 생성 시 사용할 1줄 설명
}

export interface EmoticonGenerated {
  index: number;
  expression: string;
  file: string; // output/<filename>.png
  createdAt: string;
}

export interface EmoticonMeta {
  id: string;
  market: MarketId;
  concept: string;
  /** reference 이미지 파일명들 (reference/ 하위) */
  references: string[];
  expressions: EmoticonExpression[];
  generated: EmoticonGenerated[];
  createdAt: string;
  updatedAt: string;
}

export function ensureRoot(): void {
  fs.mkdirSync(EMOTICON_ROOT, { recursive: true });
}

export function projectDir(id: string): string {
  return path.join(EMOTICON_ROOT, id);
}

export function metaPath(id: string): string {
  return path.join(projectDir(id), "meta.json");
}

export function newProjectId(): string {
  return "emj_" + crypto.randomBytes(4).toString("hex");
}

export function createProject(input: {
  market: MarketId;
  concept: string;
}): EmoticonMeta {
  ensureRoot();
  const id = newProjectId();
  const dir = projectDir(id);
  fs.mkdirSync(path.join(dir, "reference"), { recursive: true });
  fs.mkdirSync(path.join(dir, "output"), { recursive: true });
  const now = new Date().toISOString();
  const meta: EmoticonMeta = {
    id,
    market: input.market,
    concept: input.concept,
    references: [],
    expressions: [],
    generated: [],
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export function loadProject(id: string): EmoticonMeta | null {
  try {
    const raw = fs.readFileSync(metaPath(id), "utf8");
    return JSON.parse(raw) as EmoticonMeta;
  } catch {
    return null;
  }
}

export function saveProject(meta: EmoticonMeta): EmoticonMeta {
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export function listProjects(): EmoticonMeta[] {
  ensureRoot();
  const ids = fs.readdirSync(EMOTICON_ROOT).filter((n) => n.startsWith("emj_"));
  const out: EmoticonMeta[] = [];
  for (const id of ids) {
    const m = loadProject(id);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

export function saveReferenceImage(
  id: string,
  filenameSafe: string,
  buf: Buffer
): string {
  const dir = path.join(projectDir(id), "reference");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filenameSafe);
  fs.writeFileSync(file, buf);
  return path.basename(file);
}

export function saveOutputImage(
  id: string,
  index: number,
  expression: string,
  buf: Buffer
): string {
  const dir = path.join(projectDir(id), "output");
  fs.mkdirSync(dir, { recursive: true });
  const safe = expression
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 30);
  const filename = `${String(index).padStart(2, "0")}-${safe}.png`;
  fs.writeFileSync(path.join(dir, filename), buf);
  return filename;
}

export function readImageFile(
  id: string,
  kind: "reference" | "output",
  filename: string
): Buffer | null {
  const safe = path.basename(filename);
  const file = path.join(projectDir(id), kind, safe);
  if (!file.startsWith(projectDir(id))) return null; // path traversal guard
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}
