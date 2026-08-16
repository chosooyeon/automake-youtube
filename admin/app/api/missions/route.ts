import { NextResponse } from "next/server";
import { isValidDate } from "@/lib/quest";
import { addMission, deleteMission, loadMissions, updateMission } from "@/lib/missionStore";

export const dynamic = "force-dynamic";

function pickChapter(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 1;
}

/** GET — 메인 퀘스트 전체 */
export async function GET() {
  return NextResponse.json({ ok: true, missions: loadMissions() });
}

/** POST — 미션 추가 (body: { chapter, title, detail?, reward? }) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  return NextResponse.json({
    ok: true,
    missions: addMission({
      chapter: pickChapter(body?.chapter),
      title,
      detail: String(body?.detail ?? "").trim(),
      reward: String(body?.reward ?? "").trim(),
    }),
  });
}

/** PATCH — 수정 / 완료 토글 (body: { id, doneDate?, title?, detail?, reward?, chapter? }) */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const patch: Parameters<typeof updateMission>[1] = {};
  if (typeof body?.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body?.detail === "string") patch.detail = body.detail;
  if (typeof body?.reward === "string") patch.reward = body.reward;
  if (body?.chapter !== undefined) patch.chapter = pickChapter(body.chapter);
  // doneDate: 날짜면 완료, null 이면 완료 취소
  if (body?.doneDate !== undefined) {
    patch.doneDate = isValidDate(body.doneDate) ? body.doneDate : null;
  }

  return NextResponse.json({ ok: true, missions: updateMission(id, patch) });
}

/** DELETE /api/missions?id=m_xxxx */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  return NextResponse.json({ ok: true, missions: deleteMission(id) });
}
