import { NextResponse } from "next/server";
import { loadProject, saveProject, saveReferenceImage } from "@/lib/emoticonStore";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const meta = loadProject(params.id);
  if (!meta) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, project: meta });
}

/**
 * POST — reference 이미지 추가 업로드 (multipart) 또는 reference 채택 (json: {adoptBase64, mime})
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const meta = loadProject(params.id);
  if (!meta) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body?.adoptBase64) {
      return NextResponse.json({ ok: false, error: "missing_adoptBase64" }, { status: 400 });
    }
    const buf = Buffer.from(String(body.adoptBase64), "base64");
    const idx = meta.references.length;
    const filename = `adopt-${String(idx).padStart(2, "0")}.png`;
    saveReferenceImage(meta.id, filename, buf);
    meta.references.push(filename);
    saveProject(meta);
    return NextResponse.json({ ok: true, project: meta });
  }

  const form = await req.formData();
  const files = form.getAll("references");
  for (const f of files) {
    if (!(f instanceof File)) continue;
    const buf = Buffer.from(await f.arrayBuffer());
    const idx = meta.references.length;
    const ext =
      (f.type || "").includes("png") ? "png" :
      (f.type || "").includes("jpeg") ? "jpg" :
      (f.type || "").includes("webp") ? "webp" : "png";
    const filename = `upload-${String(idx).padStart(2, "0")}.${ext}`;
    saveReferenceImage(meta.id, filename, buf);
    meta.references.push(filename);
  }
  saveProject(meta);
  return NextResponse.json({ ok: true, project: meta });
}
