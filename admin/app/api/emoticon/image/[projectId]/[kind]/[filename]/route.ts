import { NextResponse } from "next/server";
import { readImageFile } from "@/lib/emoticonStore";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { projectId: string; kind: string; filename: string } }
) {
  if (params.kind !== "reference" && params.kind !== "output") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const buf = readImageFile(params.projectId, params.kind, params.filename);
  if (!buf) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const ext = (params.filename.split(".").pop() || "png").toLowerCase();
  const mime =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "webp" ? "image/webp" : "image/png";
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    },
  });
}
