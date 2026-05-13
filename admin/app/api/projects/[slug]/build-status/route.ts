import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[slug]/build-status
 * 06-edit-upload/ 의 build.log + build_meta.json + final.mp4 상태 분석.
 *
 * 반환:
 *   { state: "idle" | "running" | "concatenating" | "done" | "error",
 *     current?: number, total?: number,
 *     titledMp4?: string, finalMp4?: string,
 *     error?: string, lastLogLine?: string }
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const outDir = path.join(projectDir(slug), "06-edit-upload");
  const logPath = path.join(outDir, "build.log");
  const metaPath = path.join(outDir, "build_meta.json");
  const finalPath = path.join(outDir, "final.mp4");

  if (!fs.existsSync(logPath)) {
    return NextResponse.json({ state: "idle" });
  }

  const logContent = fs.readFileSync(logPath, "utf8");
  const logM = fs.statSync(logPath).mtimeMs;
  const hasMeta = fs.existsSync(metaPath);
  const metaM = hasMeta ? fs.statSync(metaPath).mtimeMs : 0;
  const hasFinal = fs.existsSync(finalPath);

  // 마지막 씬 진행도
  const sceneMatches = [...logContent.matchAll(/\[(\d+)\/(\d+)\]/g)];
  const lastScene = sceneMatches[sceneMatches.length - 1];
  const current = lastScene ? parseInt(lastScene[1]) : 0;
  const total = lastScene ? parseInt(lastScene[2]) : 0;
  const isConcatting = /▶ Concatenating/.test(logContent.slice(-2000)) && !hasMeta;

  // 완료: meta 존재 + log 마지막보다 새로 (또는 동일)
  const isFinished = hasMeta && hasFinal && metaM >= logM - 1000;
  if (isFinished) {
    let meta: any = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {}
    const titledMp4: string | undefined = meta.output_file;
    return NextResponse.json({
      state: "done",
      current: total,
      total,
      finalMp4: "06-edit-upload/final.mp4",
      titledMp4: titledMp4 ? `06-edit-upload/${titledMp4}` : null,
      duration_sec: meta.total_duration_sec,
      built_at: meta.built_at,
    });
  }

  // 에러 감지
  const errMatch = logContent.match(/(❌[^\n]*|Error:[^\n]*|Aborting\.)/);
  const recentlyActive = Date.now() - logM < 90_000;
  if (errMatch && !recentlyActive) {
    return NextResponse.json({
      state: "error",
      current,
      total,
      error: errMatch[1].slice(0, 200),
    });
  }

  // 진행 중
  if (recentlyActive || isConcatting) {
    // 마지막 의미 있는 라인 (📸/🔊/🎬/▶/saved/audio dur)
    const lines = logContent.trim().split("\n");
    const lastMeaningful =
      [...lines].reverse().find((l) => /(📸|🔊|🎬|▶|saved|audio dur)/.test(l))?.trim() ?? "";
    return NextResponse.json({
      state: isConcatting ? "concatenating" : "running",
      current,
      total,
      lastLogLine: lastMeaningful.slice(0, 200),
    });
  }

  // 멈춰 있고 meta 없음 — stuck 으로 간주
  return NextResponse.json({
    state: "error",
    current,
    total,
    error: "빌드가 멈춘 것 같습니다 (로그 90초 이상 미갱신). 다시 시도하세요.",
  });
}
