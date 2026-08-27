import { NextResponse } from "next/server";
import { listAssets, addAsset, updateAsset, deleteAsset } from "@/lib/toon/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, assets: listAssets() });
}

export async function POST(req: Request) {
  let body: { dataUrl?: string; expression?: string; note?: string; kind?: "char" | "prop" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(body.dataUrl ?? "");
  if (!m) {
    return NextResponse.json(
      { ok: false, error: "bad_image", message: "PNG/JPEG/WEBP 이미지만 올릴 수 있어요." },
      { status: 400 }
    );
  }
  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength > 8 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "too_large", message: "8MB 이하만 가능해요." }, { status: 400 });
  }
  const asset = addAsset(buf, { expression: body.expression, note: body.note, kind: body.kind });
  return NextResponse.json({ ok: true, asset });
}

export async function PATCH(req: Request) {
  let body: { id?: string; expression?: string; note?: string; base?: boolean; kind?: "char" | "prop" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ ok: false, error: "no_id" }, { status: 400 });
  const patch: { expression?: string; note?: string; base?: boolean; kind?: "char" | "prop" } = {};
  if (body.expression !== undefined) patch.expression = body.expression;
  if (body.note !== undefined) patch.note = body.note;
  if (body.base !== undefined) patch.base = body.base;
  if (body.kind !== undefined) patch.kind = body.kind;
  const asset = updateAsset(body.id, patch);
  if (!asset) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, asset });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "no_id" }, { status: 400 });
  return NextResponse.json({ ok: deleteAsset(id) });
}
