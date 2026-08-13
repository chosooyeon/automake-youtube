import { NextResponse } from "next/server";
import { searchStocks } from "@/lib/stock/naver";

export const dynamic = "force-dynamic";

/** GET /api/stock/search?q=삼성전자 — 관심종목 추가용 자동완성 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ ok: true, items: [] });

  try {
    const items = await searchStocks(q, 8);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "search_failed", message: (e as Error).message },
      { status: 502 }
    );
  }
}
