import { NextResponse } from "next/server";
import { STAGES, type StageId } from "@/lib/paths";
import { runBot } from "@/lib/runBot";

export const dynamic = "force-dynamic";

/**
 * 풀 파이프라인을 한 번에 시작.
 * - 5번까지만 (06-edit-upload는 휴먼게이트)
 * - 직렬 실행: 봇 1개가 끝나야 다음 봇 시작
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json().catch(() => ({}));
  const upTo = String(body?.upTo ?? "05-visual") as StageId;
  if (!STAGES.includes(upTo)) {
    return NextResponse.json({ ok: false, error: `unknown stage: ${upTo}` }, { status: 400 });
  }
  const targetIdx = STAGES.indexOf(upTo);
  const order = STAGES.slice(0, targetIdx + 1);

  // 비동기로 직렬 실행 (응답은 즉시 반환)
  (async () => {
    for (const stage of order) {
      await new Promise<void>((resolve) => {
        try {
          const { child } = runBot({ slug: params.slug, stage, extraNote: "풀 파이프라인 자동 실행" });
          child.on("close", () => resolve());
          child.on("error", () => resolve());
        } catch {
          resolve();
        }
      });
    }
  })();

  return NextResponse.json({ ok: true, started: order, note: "백그라운드에서 직렬 실행 중. 로그 탭에서 확인." });
}
