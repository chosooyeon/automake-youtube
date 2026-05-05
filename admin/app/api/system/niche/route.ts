import { NextResponse } from "next/server";
import { getActiveNiche, setActiveNiche, listNiches } from "@/lib/niche";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    active: getActiveNiche(),
    niches: listNiches(),
  });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "name 필요" }, { status: 400 });
  }
  const r = setActiveNiche(name);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, active: name });
}
