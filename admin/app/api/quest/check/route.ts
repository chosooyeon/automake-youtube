import { NextResponse } from "next/server";
import { isValidDate } from "@/lib/quest";
import { setCheck } from "@/lib/questStore";

export const dynamic = "force-dynamic";

/** POST — 하루치 체크 토글 (body: { date, taskId, done, mini? }) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const date = body?.date;
  const taskId = String(body?.taskId ?? "").trim();

  if (!isValidDate(date) || !taskId) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "date(YYYY-MM-DD) 와 taskId 가 필요합니다." },
      { status: 400 }
    );
  }

  const log = setCheck(date, taskId, body?.done !== false, body?.mini === true);
  return NextResponse.json({ ok: true, log });
}
