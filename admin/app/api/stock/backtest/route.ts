import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { STOCK_DATA_DIR } from "@/lib/stock/store";

export const dynamic = "force-dynamic";

/**
 * 스윕 결과 조회 — 파일은 `scripts/backtest-sweep.ts` 가 만든다 (여기서 실행하지 않는다).
 * 백테스트 1회에 수십 초가 걸리므로 요청-응답 안에서 돌리면 타임아웃이 난다.
 *
 * 결과는 종목군(group) × 설정(variant) 2차원이고, 매매 내역은 조합당 수백 건이다.
 * 통째로 내보내면 응답이 수 MB가 되므로 세 갈래로 자른다:
 *   GET ?market=US                                  → 그룹 목록 + 첫 그룹 요약
 *   GET ?market=US&group=index                      → 그 그룹 요약 (trades 제외)
 *   GET ?market=US&group=index&variant=score6&page=2 → 그 조합의 매매 내역 한 페이지
 */

const MAX_PAGE_SIZE = 200;

interface SweepVariant {
  id: string;
  trades: unknown[];
  [k: string]: unknown;
}

interface SweepGroup {
  id: string;
  label: string;
  note: string | null;
  symbols: string[];
  variants: SweepVariant[];
}

interface SweepFile {
  generatedAt: string;
  market: string;
  days: number;
  from: string | null;
  to: string | null;
  symbols: string[];
  groups: SweepGroup[];
}

function readSweep(market: string): SweepFile | null {
  const file = path.join(STOCK_DATA_DIR, "backtest", `sweep-${market}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as SweepFile;
    return Array.isArray(parsed?.groups) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = (url.searchParams.get("market") || "KR").toUpperCase();

  if (market !== "KR" && market !== "US") {
    return NextResponse.json(
      { ok: false, error: "invalid_market", message: "market 은 KR 또는 US 여야 합니다." },
      { status: 400 }
    );
  }

  const sweep = readSweep(market);
  if (!sweep) {
    // 파일이 없거나, groups 가 없는 옛 형식이면 다시 뽑게 한다
    return NextResponse.json({
      ok: true,
      exists: false,
      market,
      command: `cd admin && npx tsx ../scripts/backtest-sweep.ts --market ${market}`,
    });
  }

  const groupId = url.searchParams.get("group");
  const group = groupId ? sweep.groups.find((g) => g.id === groupId) : sweep.groups[0];
  if (!group) {
    return NextResponse.json(
      { ok: false, error: "unknown_group", message: `종목군 '${groupId}' 가 없습니다.` },
      { status: 404 }
    );
  }

  // 그룹 탭에 필요한 최소 정보만 (variants 는 뺀다)
  const groupList = sweep.groups.map((g) => ({
    id: g.id,
    label: g.label,
    note: g.note,
    symbolCount: g.symbols.length,
  }));

  const variantId = url.searchParams.get("variant");

  // 매매 내역 한 페이지
  if (variantId) {
    const v = group.variants.find((x) => x.id === variantId);
    if (!v) {
      return NextResponse.json(
        { ok: false, error: "unknown_variant", message: `설정 '${variantId}' 가 없습니다.` },
        { status: 404 }
      );
    }
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("size")) || 25));
    const total = v.trades.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(pages, Math.max(1, Number(url.searchParams.get("page")) || 1));
    const start = (page - 1) * size;

    return NextResponse.json({
      ok: true,
      exists: true,
      group: group.id,
      variant: variantId,
      page,
      size,
      pages,
      total,
      trades: v.trades.slice(start, start + size),
    });
  }

  // 그룹 요약 — trades 만 떼어낸다
  const variants = group.variants.map(({ trades, ...rest }) => ({
    ...rest,
    tradeCount: trades.length,
  }));

  return NextResponse.json({
    ok: true,
    exists: true,
    generatedAt: sweep.generatedAt,
    market: sweep.market,
    days: sweep.days,
    from: sweep.from,
    to: sweep.to,
    groups: groupList,
    group: { id: group.id, label: group.label, note: group.note, symbols: group.symbols },
    variants,
  });
}
