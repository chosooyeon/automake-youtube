import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const dir = path.join(projectDir(params.slug), "06-edit-upload", "thumbnails");
  if (!fs.existsSync(dir)) return NextResponse.json({ files: [] });
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .map((f) => ({
      name: f,
      url: `/api/projects/${encodeURIComponent(params.slug)}/file?p=${encodeURIComponent(`06-edit-upload/thumbnails/${f}`)}`,
    }));
  return NextResponse.json({ files });
}
