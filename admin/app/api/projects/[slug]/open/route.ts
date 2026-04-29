import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * Mac Finder에서 06-edit-upload 폴더 또는 CapCut 프로젝트 위치를 연다.
 * body: { target: "edit" | "capcut" | "project" }
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json().catch(() => ({}));
  const target = String(body?.target ?? "edit");

  let p: string;
  if (target === "capcut") {
    const home = process.env.HOME || "";
    p = path.join(home, "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft");
  } else if (target === "project") {
    p = projectDir(params.slug);
  } else {
    p = path.join(projectDir(params.slug), "06-edit-upload");
  }
  if (!fs.existsSync(p)) {
    return NextResponse.json({ ok: false, error: `폴더가 없습니다: ${p}` }, { status: 404 });
  }
  spawn("open", [p], { detached: true, stdio: "ignore" }).unref();
  return NextResponse.json({ ok: true, opened: p });
}
