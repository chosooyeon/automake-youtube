import { NextResponse } from "next/server";
import fs from "node:fs";
import { briefPath, projectDir } from "@/lib/paths";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const p = briefPath(params.slug);
  if (!fs.existsSync(p)) return NextResponse.json({ exists: false, content: "" });
  return NextResponse.json({ exists: true, content: fs.readFileSync(p, "utf8") });
}

export async function PUT(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json().catch(() => ({}));
  const content = String(body?.content ?? "");
  const inputDir = path.join(projectDir(params.slug), "00-input");
  if (!fs.existsSync(inputDir)) {
    return NextResponse.json({ ok: false, error: "프로젝트가 없습니다." }, { status: 404 });
  }
  fs.writeFileSync(briefPath(params.slug), content);
  return NextResponse.json({ ok: true });
}
