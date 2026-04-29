import path from "node:path";
import os from "node:os";

// admin/ 폴더 기준에서 한 단계 위가 자동화 레포 루트
export const REPO_ROOT = path.resolve(process.cwd(), "..");

export const PROJECTS_DIR = path.join(REPO_ROOT, "projects");
export const CONFIG_DIR = path.join(REPO_ROOT, "config");
export const BOTS_DIR = path.join(REPO_ROOT, "bots");
export const SHARED_DIR = path.join(REPO_ROOT, "shared");

export const STAGES = [
  "01-benchmark",
  "02-strategy",
  "03-script",
  "04-audio",
  "05-visual",
  "06-edit-upload",
] as const;
export type StageId = (typeof STAGES)[number];

export const STAGE_LABELS: Record<StageId, string> = {
  "01-benchmark": "벤치마크",
  "02-strategy": "전략",
  "03-script": "대본",
  "04-audio": "음성",
  "05-visual": "비주얼",
  "06-edit-upload": "편집/업로드",
};

export function projectDir(slug: string): string {
  return path.join(PROJECTS_DIR, slug);
}

export function stageDir(slug: string, stage: StageId): string {
  return path.join(projectDir(slug), stage);
}

export function stageOutputJson(slug: string, stage: StageId): string {
  return path.join(stageDir(slug, stage), "output.json");
}

export function stageRunLog(slug: string, stage: StageId): string {
  return path.join(stageDir(slug, stage), "run.log.md");
}

export function briefPath(slug: string): string {
  return path.join(projectDir(slug), "00-input", "brief.md");
}

export function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}
