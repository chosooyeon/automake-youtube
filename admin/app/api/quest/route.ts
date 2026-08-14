import { NextResponse } from "next/server";
import { loadLog, loadSeason, loadTasks } from "@/lib/questStore";

export const dynamic = "force-dynamic";

/**
 * GET — 퀘스트 정의 + 완료 기록 + 시즌 전체.
 * 1년치라도 수백 KB 라 통째로 내려주고 집계는 클라이언트에서 한다
 * (일/월/년 뷰를 오갈 때마다 왕복하지 않기 위해).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    tasks: loadTasks(),
    log: loadLog(),
    season: loadSeason(),
  });
}
