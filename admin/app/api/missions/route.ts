import { NextResponse } from "next/server";
import { isValidDate } from "@/lib/quest";
import { addMission, deleteMission, loadMissions, updateMission } from "@/lib/missionStore";
import { DEFAULT_TRACK, isTrackId, trackMeta } from "@/lib/mission";

export const dynamic = "force-dynamic";

function pickTrack(raw: unknown): string {
  return isTrackId(raw) ? raw : DEFAULT_TRACK;
}

/** 챕터 번호는 트랙 안에서만 유효하다 — 트랙에 없는 번호는 첫 챕터로 */
function pickChapter(track: string, raw: unknown): number {
  const n = Number(raw);
  const chapters = trackMeta(track).chapters;
  return chapters.some((c) => c.id === n) ? n : chapters[0].id;
}

/** GET — 메인 퀘스트 전체 */
export async function GET() {
  return NextResponse.json({ ok: true, missions: loadMissions() });
}

/** POST — 미션 추가 (body: { track, chapter, title, detail?, reward? }) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  const track = pickTrack(body?.track);
  return NextResponse.json({
    ok: true,
    missions: addMission({
      track,
      chapter: pickChapter(track, body?.chapter),
      title,
      detail: String(body?.detail ?? "").trim(),
      reward: String(body?.reward ?? "").trim(),
    }),
  });
}

/** PATCH — 수정 / 완료 토글 (body: { id, doneDate?, title?, detail?, reward?, track?, chapter? }) */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const patch: Parameters<typeof updateMission>[1] = {};
  if (typeof body?.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body?.detail === "string") patch.detail = body.detail;
  if (typeof body?.reward === "string") patch.reward = body.reward;
  if (body?.track !== undefined) patch.track = pickTrack(body.track);
  if (body?.chapter !== undefined) {
    // 챕터 유효범위는 트랙에 달렸다 — 같이 안 넘어왔으면 원래 트랙 기준
    const track = patch.track ?? loadMissions().find((m) => m.id === id)?.track ?? DEFAULT_TRACK;
    patch.chapter = pickChapter(track, body.chapter);
  }
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
