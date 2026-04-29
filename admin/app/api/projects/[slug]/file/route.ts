import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * 프로젝트 폴더 안의 정적 파일을 안전하게 서빙.
 * (path traversal 방지: projectDir 밖으로 못 나감)
 */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("p") || "";
  const root = projectDir(params.slug);
  const abs = path.normalize(path.join(root, rel));
  if (!abs.startsWith(root)) return new NextResponse("forbidden", { status: 403 });
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return new NextResponse("not found", { status: 404 });

  const ext = path.extname(abs).toLowerCase();
  const mime: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".srt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };
  const ct = mime[ext] || "application/octet-stream";
  const buf = fs.readFileSync(abs);
  return new NextResponse(buf, { headers: { "content-type": ct, "cache-control": "no-store" } });
}
