import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { STAGES, type StageId, projectDir, stageRunLog } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage") as StageId | null;
  const tail = parseInt(url.searchParams.get("tail") || "8000", 10);

  if (stage && STAGES.includes(stage)) {
    const p = stageRunLog(params.slug, stage);
    if (!fs.existsSync(p)) return NextResponse.json({ logs: "" });
    const c = fs.readFileSync(p, "utf8");
    return NextResponse.json({ logs: c.length > tail ? c.slice(-tail) : c });
  }

  // 전체 로그 합치기
  const out: string[] = [];
  for (const s of STAGES) {
    const p = stageRunLog(params.slug, s);
    if (fs.existsSync(p)) {
      out.push(`\n========== ${s} ==========`);
      const c = fs.readFileSync(p, "utf8");
      out.push(c.length > 2000 ? c.slice(-2000) : c);
    }
  }
  // 업로드 로그
  const uploadLog = path.join(projectDir(params.slug), "06-edit-upload", "upload.log.md");
  if (fs.existsSync(uploadLog)) {
    out.push(`\n========== upload ==========`);
    const c = fs.readFileSync(uploadLog, "utf8");
    out.push(c.length > 4000 ? c.slice(-4000) : c);
  }
  return NextResponse.json({ logs: out.join("\n") });
}
