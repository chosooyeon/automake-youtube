import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { projectDir, type ShortsStageId } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage") as ShortsStageId | null;
  if (!stage) return NextResponse.json({ logs: "" });

  const logPath = path.join(projectDir(params.slug), stage, "run.log.md");
  const logs = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  return NextResponse.json({ logs });
}
