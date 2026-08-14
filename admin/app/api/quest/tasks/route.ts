import { NextResponse } from "next/server";
import { TRACK_IDS, isValidDate, toDateStr, type TrackId } from "@/lib/quest";
import { addTask, deleteTask, reorderTasks, updateTask } from "@/lib/questStore";

export const dynamic = "force-dynamic";

function pickDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)));
}

function pickTrack(raw: unknown): TrackId {
  return TRACK_IDS.includes(raw as TrackId) ? (raw as TrackId) : "etc";
}

/** POST — 퀘스트 추가 (body: { name, track, days[], startDate? }) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  }

  const tasks = addTask({
    name,
    track: pickTrack(body?.track),
    days: pickDays(body?.days),
    mini: String(body?.mini ?? "").trim(),
    // 브라우저의 로컬 날짜를 받는다 (서버 UTC 로 자르면 밤에 하루 밀린다)
    startDate: isValidDate(body?.startDate) ? body.startDate : toDateStr(new Date()),
  });
  return NextResponse.json({ ok: true, tasks });
}

/**
 * PATCH — 수정 (body: { id, name?, track?, days?, archivedDate? })
 *         또는 순서 변경 (body: { order: string[] })
 */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);

  if (Array.isArray(body?.order)) {
    return NextResponse.json({ ok: true, tasks: reorderTasks(body.order.map(String)) });
  }

  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const patch: Parameters<typeof updateTask>[1] = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body?.track !== undefined) patch.track = pickTrack(body.track);
  if (body?.days !== undefined) patch.days = pickDays(body.days);
  if (typeof body?.mini === "string") patch.mini = body.mini.trim();
  // archivedDate: 날짜면 보관, null 이면 보관 해제
  if (body?.archivedDate !== undefined) {
    patch.archivedDate = isValidDate(body.archivedDate) ? body.archivedDate : null;
  }

  return NextResponse.json({ ok: true, tasks: updateTask(id, patch) });
}

/** DELETE /api/quest/tasks?id=q_xxxx — 정의 + 완료 기록까지 삭제 */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  return NextResponse.json({ ok: true, tasks: deleteTask(id) });
}
