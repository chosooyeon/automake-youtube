import { NextResponse } from "next/server";
import type { Market, StockRef } from "@/lib/stock/naver";
import {
  addWatchItem,
  loadWatchlist,
  removeWatchItem,
  updateWatchItem,
} from "@/lib/stock/store";

export const dynamic = "force-dynamic";

/** GET — 관심종목 목록 */
export async function GET() {
  return NextResponse.json({ ok: true, items: loadWatchlist() });
}

/** POST — 관심종목 추가 (body: StockRef + memo) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const symbol = String(body?.symbol ?? "").trim();
  const market = body?.market as Market;

  if (!symbol || (market !== "KR" && market !== "US")) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "symbol 과 market(KR|US) 이 필요합니다." },
      { status: 400 }
    );
  }

  const ref: StockRef = {
    symbol,
    code: String(body?.code ?? symbol),
    name: String(body?.name ?? symbol),
    market,
    exchange: String(body?.exchange ?? ""),
  };
  const items = addWatchItem(ref, body?.memo ? String(body.memo) : undefined);
  return NextResponse.json({ ok: true, items });
}

/** PATCH — 감시 on/off, 메모 수정 (body: { symbol, enabled?, memo? }) */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const symbol = String(body?.symbol ?? "").trim();
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "symbol_required" }, { status: 400 });
  }

  const patch: { enabled?: boolean; memo?: string } = {};
  if (typeof body?.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body?.memo === "string") patch.memo = body.memo;

  return NextResponse.json({ ok: true, items: updateWatchItem(symbol, patch) });
}

/** DELETE /api/stock/watchlist?symbol=005930 */
export async function DELETE(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "symbol_required" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, items: removeWatchItem(symbol) });
}
