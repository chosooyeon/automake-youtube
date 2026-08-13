import { NextResponse } from "next/server";
import { scanWatchlist } from "@/lib/stock/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 관심종목 전체 스캔.
 *   ?notify=1  텔레그램 알림까지 발송 (기본은 조회만)
 *   ?force=1   중복 방지 무시하고 무조건 발송 (테스트용)
 *
 * GET 으로도 열어둔 이유: scripts/stock-watch.mjs 와 cron/launchd 에서 curl 한 줄로 부르기 위함.
 */
async function handle(req: Request) {
  const p = new URL(req.url).searchParams;
  try {
    const summary = await scanWatchlist({
      notify: p.get("notify") === "1",
      force: p.get("force") === "1",
      symbols: p.get("symbol") ? [p.get("symbol") as string] : undefined,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "scan_failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
