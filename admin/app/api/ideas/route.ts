import { NextResponse } from "next/server";
import { CATEGORY_IDS, STATUS_IDS, type CategoryId, type StatusId } from "@/lib/idea";
import { addIdea, deleteIdea, loadIdeas, updateIdea } from "@/lib/ideaStore";

export const dynamic = "force-dynamic";

/** GET — 아이디어 전체 */
export async function GET() {
  return NextResponse.json({ ok: true, ideas: loadIdeas() });
}

/** POST — 추가 (body: { title, category, note? }) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  const category = (
    CATEGORY_IDS.includes(body?.category) ? body.category : "content"
  ) as CategoryId;

  return NextResponse.json({
    ok: true,
    ideas: addIdea({ title, category, note: String(body?.note ?? "").trim() }),
  });
}

/** PATCH — 수정 (body: { id, title?, note?, category?, status? }) */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const patch: Parameters<typeof updateIdea>[1] = {};
  if (typeof body?.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body?.note === "string") patch.note = body.note;
  if (CATEGORY_IDS.includes(body?.category)) patch.category = body.category as CategoryId;
  if (STATUS_IDS.includes(body?.status)) patch.status = body.status as StatusId;

  return NextResponse.json({ ok: true, ideas: updateIdea(id, patch) });
}

/** DELETE /api/ideas?id=i_xxxx */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  return NextResponse.json({ ok: true, ideas: deleteIdea(id) });
}
