import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { STOCK_DATA_DIR } from "@/lib/stock/store";
import type { Market } from "@/lib/stock/naver";
import {
  MARKETS,
  compareMarketRules,
  describeRules,
  loadAllMarketConfigs,
  validateTradingConfig,
} from "@/lib/stock/tradingConfig";

export const dynamic = "force-dynamic";

/**
 * 시장별 매매 방법론 — config/stock-trading.json 을 풀어서 그대로 보여준다.
 *
 * 계산은 없다. 여기서 숫자를 다시 만들면 화면과 백테스트가 서로 다른 규칙을
 * 말하게 되므로, 백테스트가 읽는 loadAllMarketConfigs() 하나만 통과시킨다.
 *
 * 워크포워드 결과 파일이 있으면 "그래서 검증은 됐나"까지 붙인다 —
 * 규칙만 보여주면 검증 전 가설을 확정된 전략으로 읽게 된다.
 */

interface WalkForwardFile {
  generatedAt?: string;
  split?: string;
  winner?: { id?: string; label?: string };
  validation?: { held?: boolean | null; metrics?: { trades?: number; expectancyR?: number } };
}

function readWalkForward(market: Market) {
  const file = path.join(STOCK_DATA_DIR, "backtest", `walkforward-${market}.json`);
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as WalkForwardFile;
    const held = j.validation?.held ?? null;
    return {
      ranAt: j.generatedAt ?? null,
      split: j.split ?? null,
      winner: j.winner?.label ?? null,
      trades: j.validation?.metrics?.trades ?? null,
      expectancyR: j.validation?.metrics?.expectancyR ?? null,
      /** true=유지됨 · false=무너짐 · null=판정 불가(표본 부족 등) */
      held,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const cfgs = loadAllMarketConfigs();

  const markets = MARKETS.map((m) => {
    const cfg = cfgs[m];
    return {
      market: m,
      label: cfg.marketLabel,
      note: cfg.marketNote,
      verifiedAt: cfg.verifiedAt,
      summary: describeRules(cfg),
      warnings: validateTradingConfig(cfg),
      walkForward: readWalkForward(m),
      sweepCommand: `cd admin && npx tsx ../scripts/backtest-sweep.ts --market ${m}`,
      walkForwardCommand: `cd admin && npx tsx ../scripts/walk-forward.ts --market ${m}`,
    };
  });

  return NextResponse.json({
    ok: true,
    capital: cfgs.KR.capital,
    warmupBars: cfgs.KR.warmupBars,
    markets,
    rows: compareMarketRules(cfgs),
  });
}
