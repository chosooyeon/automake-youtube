import { NextResponse } from "next/server";
import { loadProgress, loadSubjects, resetProgress } from "@/lib/studyStore";

export const dynamic = "force-dynamic";

/** GET — 과목 전체(책 본문) + 복습 상태 */
export async function GET() {
  return NextResponse.json({ ok: true, subjects: loadSubjects(), progress: loadProgress() });
}

/** DELETE /api/study?prefix=cloud  또는  ?prefix=cloud/ch3  — 복습 기록 초기화 */
export async function DELETE(req: Request) {
  const prefix = new URL(req.url).searchParams.get("prefix")?.trim() ?? "";
  if (!prefix) return NextResponse.json({ ok: false, error: "prefix_required" }, { status: 400 });
  return NextResponse.json({ ok: true, progress: resetProgress(prefix) });
}
