import { NextResponse } from "next/server";
import fs from "node:fs";
import { assetFilePath } from "@/lib/toon/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get("f") ?? "";
  const p = assetFilePath(file);
  if (!p) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const buf = fs.readFileSync(p);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
