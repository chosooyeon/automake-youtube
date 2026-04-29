import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, STAGES, type StageId, projectDir, stageDir, stageOutputJson } from "./paths";

export type StageStatus = "done" | "in_progress" | "failed" | "pending" | "missing_inputs";

export interface ProjectSummary {
  slug: string;
  hasBrief: boolean;
  stages: Record<StageId, StageStatus>;
  lastModified: number;
}

export function listProjectSlugs(): string[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
}

const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5분간 로그 변화 없으면 stuck으로 처리

function isLastRunFinished(logContent: string): boolean {
  const runMatches = [...logContent.matchAll(/## ▶ Run @ /g)];
  const exitMatches = [...logContent.matchAll(/- exit_code: /g)];
  if (runMatches.length === 0 || exitMatches.length === 0) return false;
  const lastRunIdx = runMatches[runMatches.length - 1].index!;
  const lastExitIdx = exitMatches[exitMatches.length - 1].index!;
  return lastExitIdx > lastRunIdx;
}

function isStaleLog(logPath: string): boolean {
  try {
    return Date.now() - fs.statSync(logPath).mtimeMs > STALE_TIMEOUT_MS;
  } catch {
    return false;
  }
}

export function getStageStatus(slug: string, stage: StageId): StageStatus {
  const out = stageOutputJson(slug, stage);
  if (fs.existsSync(out)) return "done";

  const dir = stageDir(slug, stage);
  if (fs.existsSync(dir)) {
    const logPath = path.join(dir, "run.log.md");
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, "utf8");
      if (isLastRunFinished(logContent)) return "failed";
      if (isStaleLog(logPath)) return "failed"; // 5분 이상 응답 없음 → stuck
      return "in_progress";
    }
  }
  return "pending";
}

export function getShortsStageStatus(slug: string, stage: string): StageStatus {
  const outPath = path.join(projectDir(slug), stage, "output.json");
  if (fs.existsSync(outPath)) return "done";

  const stageDirectory = path.join(projectDir(slug), stage);
  if (fs.existsSync(stageDirectory)) {
    const logPath = path.join(stageDirectory, "run.log.md");
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, "utf8");
      if (isLastRunFinished(logContent)) return "failed";
      if (isStaleLog(logPath)) return "failed"; // 5분 이상 응답 없음 → stuck
      return "in_progress";
    }
  }
  return "pending";
}

export function getProjectSummary(slug: string): ProjectSummary {
  const stages = {} as Record<StageId, StageStatus>;
  for (const s of STAGES) stages[s] = getStageStatus(slug, s);
  const briefPath = path.join(projectDir(slug), "00-input", "brief.md");
  let lastModified = 0;
  try {
    lastModified = fs.statSync(projectDir(slug)).mtimeMs;
  } catch {}
  return {
    slug,
    hasBrief: fs.existsSync(briefPath),
    stages,
    lastModified,
  };
}

export function copyExampleProject(newSlug: string): { ok: boolean; reason?: string } {
  const source = path.join(PROJECTS_DIR, "_example");
  const target = path.join(PROJECTS_DIR, newSlug);
  if (!fs.existsSync(source)) return { ok: false, reason: "_example 템플릿이 없습니다." };
  if (fs.existsSync(target)) return { ok: false, reason: `이미 존재하는 슬러그: ${newSlug}` };
  copyDir(source, target);
  return { ok: true };
}

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
