import { NextResponse } from "next/server";
import { STAGES, type StageId } from "@/lib/paths";
import { runBot } from "@/lib/runBot";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json().catch(() => ({}));
  const stage = String(body?.stage ?? "") as StageId;
  const extraNote: string | undefined = body?.note ? String(body.note) : undefined;

  if (!STAGES.includes(stage)) {
    return NextResponse.json({ ok: false, error: `unknown stage: ${stage}` }, { status: 400 });
  }
  try {
    const { logPath } = runBot({ slug: params.slug, stage, extraNote });
    return NextResponse.json({ ok: true, logPath, stage });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
