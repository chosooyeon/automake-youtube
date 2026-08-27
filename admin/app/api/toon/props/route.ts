import { NextResponse } from "next/server";
import { loadProps, buildPropPrompt } from "@/lib/toon/props";

export const dynamic = "force-dynamic";

export async function GET() {
  const props = loadProps().map((p) => ({ ...p, fullPrompt: buildPropPrompt(p) }));
  return NextResponse.json({ ok: true, props });
}
