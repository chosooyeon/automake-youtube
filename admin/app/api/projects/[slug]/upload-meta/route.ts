import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[slug]/upload-meta
 * 06-edit-upload/upload_metadata.json 반환. 없으면 { exists: false }.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const p = path.join(projectDir(params.slug), "06-edit-upload", "upload_metadata.json");
  if (!fs.existsSync(p)) {
    return NextResponse.json({ exists: false });
  }
  try {
    const meta = JSON.parse(fs.readFileSync(p, "utf8"));
    return NextResponse.json({ exists: true, ...meta });
  } catch (e: any) {
    return NextResponse.json({ exists: false, error: e?.message }, { status: 500 });
  }
}
