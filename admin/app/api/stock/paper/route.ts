import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { STOCK_DATA_DIR } from "@/lib/stock/store";
import { loadPaperCharter } from "@/lib/stock/paper";
import type { Market } from "@/lib/stock/naver";

export const dynamic = "force-dynamic";

/**
 * 페이퍼 트레이딩 결과 조회.
 *
 * 계산은 `scripts/paper-trade.ts` 가 한다 (100종목 재생에 1분 넘게 걸려 요청 안에서 못 돈다).
 * 여기서는 그 산출물만 읽는다. 계약서(config/paper-{market}.json)는 커밋되지만
 * 결과(admin/data/stock/paper/{market}.json)는 git 제외 — 언제든 다시 만들 수 있으므로.
 */

function readReport(market: Market): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(STOCK_DATA_DIR, "paper", `${market}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const market = (new URL(req.url).searchParams.get("market") || "KR").toUpperCase() as Market;
  if (market !== "KR" && market !== "US") {
    return NextResponse.json(
      { ok: false, error: "invalid_market", message: "market 은 KR 또는 US 여야 합니다." },
      { status: 400 }
    );
  }

  const charter = loadPaperCharter(market);
  const runCommand = `cd admin && npx tsx ../scripts/paper-trade.ts --market ${market}`;

  if (!charter) {
    return NextResponse.json({
      ok: true,
      started: false,
      market,
      // 계약서가 없으면 아직 시작 전 — 시작 명령을 알려준다
      initCommand:
        `cd admin && npx tsx ../scripts/paper-trade.ts --market ${market} --init` +
        (market === "KR" ? " --universe marketCap --top 100" : ""),
    });
  }

  const saved = readReport(market) as { report?: unknown; ranAt?: string; candidates?: unknown } | null;

  return NextResponse.json({
    ok: true,
    started: true,
    market,
    charter: {
      startedAt: charter.startedAt,
      universeNote: charter.universeNote,
      universeSize: charter.universe.length,
      config: charter.config,
    },
    report: saved?.report ?? null,
    candidates: saved?.candidates ?? null,
    ranAt: saved?.ranAt ?? null,
    runCommand,
  });
}
