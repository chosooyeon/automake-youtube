import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { STOCK_DATA_DIR } from "@/lib/stock/store";
import { isValidTrack, labelOf, listPaperTracks, loadPaperCharter } from "@/lib/stock/paper";

export const dynamic = "force-dynamic";

/**
 * 페이퍼 트레이딩 결과 조회.
 *
 * 계산은 `scripts/paper-trade.ts` 가 한다 (100종목 재생에 1분 넘게 걸려 요청 안에서 못 돈다).
 * 여기서는 그 산출물만 읽는다. 계약서(config/paper-{track}.json)는 커밋되지만
 * 결과(admin/data/stock/paper/{track}.json)는 git 제외 — 언제든 다시 만들 수 있으므로.
 *
 * 단위는 시장이 아니라 **트랙**이다. 한 시장에 규칙이 다른 트랙이 여럿 있을 수 있고
 * (KR = 현재 설정, KR2 = 덜 판다), 그게 "바꾼 게 나은가"를 밝히는 유일한 방법이다.
 * 옛 링크(?market=KR)는 트랙 ID 가 시장 이름과 같아서 그대로 동작한다.
 */

function readReport(track: string): { report?: unknown; ranAt?: string; candidates?: unknown } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(STOCK_DATA_DIR, "paper", `${track}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const track = sp.get("track") || (sp.get("market") || "KR").toUpperCase();

  if (!isValidTrack(track)) {
    return NextResponse.json(
      { ok: false, error: "invalid_track", message: "track 은 영문·숫자·-·_ 만 가능합니다." },
      { status: 400 }
    );
  }

  // 화면이 트랙 탭을 그릴 수 있도록 목록을 항상 함께 준다
  const tracks = listPaperTracks().map((id) => {
    const c = loadPaperCharter(id);
    return { id, label: c ? labelOf(c) : id, market: c?.market ?? null, startedAt: c?.startedAt ?? null };
  });

  const charter = loadPaperCharter(track);
  const runCommand = `cd admin && npx tsx ../scripts/paper-trade.ts --track ${track}`;

  if (!charter) {
    const market = track === "US" ? "US" : "KR";
    return NextResponse.json({
      ok: true,
      started: false,
      track,
      market,
      tracks,
      // 계약서가 없으면 아직 시작 전 — 시작 명령을 알려준다
      initCommand:
        `cd admin && npx tsx ../scripts/paper-trade.ts --market ${market} --track ${track} --init` +
        (market === "KR" ? " --universe marketCap --top 100" : ""),
    });
  }

  const saved = readReport(track);

  return NextResponse.json({
    ok: true,
    started: true,
    track,
    label: labelOf(charter),
    market: charter.market,
    tracks,
    charter: {
      startedAt: charter.startedAt,
      universeNote: charter.universeNote,
      universeSize: charter.universe.length,
      config: charter.config,
      note: charter.note,
    },
    report: saved?.report ?? null,
    candidates: saved?.candidates ?? null,
    ranAt: saved?.ranAt ?? null,
    runCommand,
  });
}
