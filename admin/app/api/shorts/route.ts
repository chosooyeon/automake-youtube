import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, shortsMetaPath, SHORTS_STAGES, shortsStageOutputJson, type ShortsStageId } from "@/lib/paths";

export const dynamic = "force-dynamic";

export interface ShortsProject {
  slug: string;
  parentSlug: string;
  createdAt?: string;
  stages: Record<ShortsStageId, "done" | "in_progress" | "pending">;
}

export async function GET() {
  if (!fs.existsSync(PROJECTS_DIR)) return NextResponse.json({ projects: [] });

  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .map((d) => d.name);

  const projects: ShortsProject[] = [];

  for (const slug of dirs) {
    const metaPath = shortsMetaPath(slug);
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.type !== "shorts") continue;

      const stages = {} as Record<ShortsStageId, "done" | "in_progress" | "pending">;
      for (const s of SHORTS_STAGES) {
        const out = shortsStageOutputJson(slug, s);
        if (fs.existsSync(out)) {
          stages[s] = "done";
        } else {
          const logPath = path.join(PROJECTS_DIR, slug, s, "run.log.md");
          stages[s] = fs.existsSync(logPath) ? "in_progress" : "pending";
        }
      }

      projects.push({
        slug,
        parentSlug: meta.parent_slug,
        createdAt: meta.created_at,
        stages,
      });
    } catch {}
  }

  projects.sort((a, b) => (a.createdAt && b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : 0));

  return NextResponse.json({ projects });
}
