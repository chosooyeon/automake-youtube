import { NextResponse } from "next/server";
import { isValidDate } from "@/lib/quest";
import { saveSeason } from "@/lib/questStore";

export const dynamic = "force-dynamic";

/** PATCH — 시즌 수정 (body: { name?, startDate?, weeks? }) */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);

  const patch: { name?: string; startDate?: string; weeks?: number } = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (isValidDate(body?.startDate)) patch.startDate = body.startDate;
  if (Number.isFinite(body?.weeks) && body.weeks > 0 && body.weeks <= 104) {
    patch.weeks = Math.round(body.weeks);
  }

  return NextResponse.json({ ok: true, season: saveSeason(patch) });
}
