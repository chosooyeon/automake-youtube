import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, STAGES, type StageId, projectDir, stageDir, stageOutputJson } from "./paths";

export type StageStatus = "done" | "in_progress" | "pending" | "missing_inputs";

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

export function getStageStatus(slug: string, stage: StageId): StageStatus {
  const out = stageOutputJson(slug, stage);
  if (fs.existsSync(out)) return "done";
  // 진행중: stageDir에 run.log.md만 있고 output.json 없는 경우
  const dir = stageDir(slug, stage);
  if (fs.existsSync(dir)) {
    const log = path.join(dir, "run.log.md");
    if (fs.existsSync(log)) return "in_progress";
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
