import { NextResponse } from "next/server";
import { gradeCard } from "@/lib/studyStore";

export const dynamic = "force-dynamic";

/** POST — 카드 채점 (body: { key, grade: "again" | "good" }) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "").trim();
  const g = body?.grade;
  if (!key || (g !== "again" && g !== "good"))
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  return NextResponse.json({ ok: true, progress: gradeCard(key, g) });
}
