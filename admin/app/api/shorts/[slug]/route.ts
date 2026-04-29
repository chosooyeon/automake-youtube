import { NextResponse } from "next/server";
import fs from "node:fs";
import { shortsMetaPath, projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  const metaPath = shortsMetaPath(params.slug);
  if (!fs.existsSync(metaPath)) {
    return NextResponse.json({ ok: false, error: "숏폼 프로젝트가 아닙니다." }, { status: 404 });
  }
  try {
    fs.rmSync(projectDir(params.slug), { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
