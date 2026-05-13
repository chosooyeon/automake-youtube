import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR } from "@/lib/paths";
import archiver from "archiver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug || !/^insta-[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  }
  const cardsDir = path.join(PROJECTS_DIR, slug, "instagram-cards", "cards");
  if (!fs.existsSync(cardsDir)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const captionPath = path.join(PROJECTS_DIR, slug, "instagram-cards", "caption.txt");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      archive.on("end", () => controller.close());
      archive.on("error", (e) => controller.error(e));

      for (const f of fs.readdirSync(cardsDir).sort()) {
        if (f.endsWith(".png")) {
          archive.file(path.join(cardsDir, f), { name: f });
        }
      }
      if (fs.existsSync(captionPath)) {
        archive.file(captionPath, { name: "caption.txt" });
      }
      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
