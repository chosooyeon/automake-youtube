import { NextResponse } from "next/server";
import { runUploadScript } from "@/lib/runBot";
import fs from "node:fs";
import path from "node:path";
import { projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * POST: 업로드 시작
 *  body: { confirm: true, dryRun?: boolean }
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json({ ok: false, error: "confirm: true 필요 (2단계 확인)" }, { status: 400 });
  }
  try {
    const channel = Number.isInteger(body?.channel) ? (body.channel as number) : 1;
    const r = runUploadScript(params.slug, { dryRun: !!body?.dryRun, channel });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

/**
 * GET: 업로드 메타데이터 조회 (upload_metadata.json + final.mp4 존재 여부)
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const metaPath = path.join(projectDir(params.slug), "06-edit-upload", "upload_metadata.json");
  const videoPath = path.join(projectDir(params.slug), "06-edit-upload", "final.mp4");
  let meta: any = null;
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch {}
  }
  let videoSizeMB: number | null = null;
  if (fs.existsSync(videoPath)) {
    videoSizeMB = +(fs.statSync(videoPath).size / 1024 / 1024).toFixed(2);
  }
  return NextResponse.json({
    metaExists: !!meta,
    meta,
    videoExists: fs.existsSync(videoPath),
    videoSizeMB,
  });
}
