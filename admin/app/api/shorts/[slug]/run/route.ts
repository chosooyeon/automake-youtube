import { NextResponse } from "next/server";
import fs from "node:fs";
import { shortsMetaPath, SHORTS_STAGES, type ShortsStageId } from "@/lib/paths";
import { runShortsBot } from "@/lib/runBot";

export const dynamic = "force-dynamic";

/**
 * POST /api/shorts/[slug]/run
 * body: { stage: ShortsStageId }
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json().catch(() => ({}));
  const stage = body?.stage as ShortsStageId | undefined;

  if (!stage || !SHORTS_STAGES.includes(stage as ShortsStageId)) {
    return NextResponse.json({ ok: false, error: `stage 가 잘못됐습니다. 허용: ${SHORTS_STAGES.join(", ")}` }, { status: 400 });
  }

  const metaPath = shortsMetaPath(params.slug);
  if (!fs.existsSync(metaPath)) {
    return NextResponse.json({ ok: false, error: "shorts_meta.json 이 없습니다. 숏폼 프로젝트가 아닌 것 같습니다." }, { status: 404 });
  }

  let meta: any;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return NextResponse.json({ ok: false, error: "shorts_meta.json 파싱 실패" }, { status: 500 });
  }

  const parentSlug: string = meta.parent_slug;
  if (!parentSlug) {
    return NextResponse.json({ ok: false, error: "shorts_meta.json 에 parent_slug 가 없습니다." }, { status: 400 });
  }

  try {
    const { logPath } = runShortsBot({ slug: params.slug, stage, parentSlug });
    return NextResponse.json({ ok: true, stage, logPath });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
