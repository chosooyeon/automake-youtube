import { NextResponse } from "next/server";
import fs from "node:fs";
import { shortsMetaPath, SHORTS_STAGES, projectDir, type ShortsStageId } from "@/lib/paths";
import { getShortsStageStatus } from "@/lib/projects";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const metaPath = shortsMetaPath(params.slug);
  if (!fs.existsSync(metaPath)) {
    return NextResponse.json({ ok: false, error: "숏폼 프로젝트가 아닙니다." }, { status: 404 });
  }

  let meta: any = {};
  try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch {}

  const stages: Record<string, string> = {};
  for (const s of SHORTS_STAGES) {
    stages[s] = getShortsStageStatus(params.slug, s as ShortsStageId);
  }

  const uploadDir = path.join(projectDir(params.slug), "S4-upload");
  const videoReady = fs.existsSync(path.join(uploadDir, "final_short.mp4"));
  const thumbReady =
    fs.existsSync(path.join(uploadDir, "thumbnail.jpg")) ||
    fs.existsSync(path.join(uploadDir, "thumbnail.png"));

  return NextResponse.json({ ok: true, slug: params.slug, meta, stages, videoReady, thumbReady });
}
