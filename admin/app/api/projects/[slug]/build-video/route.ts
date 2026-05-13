import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[slug]/build-video
 * scripts/build-video.mjs 를 백그라운드 spawn 하고 즉시 리턴.
 * 로그는 06-edit-upload/build.log 에 append. 상태는 GET /build-status 에서 폴링.
 *
 * body (선택): { forceAudio?: boolean, forceImageScene?: string }
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const body = await req.json().catch(() => ({}));
  const forceAudio = !!body?.forceAudio;
  const forceImageScene = body?.forceImageScene ? String(body.forceImageScene) : null;

  const proj = projectDir(slug);
  if (!fs.existsSync(proj)) {
    return NextResponse.json({ ok: false, error: `프로젝트 없음: ${slug}` }, { status: 404 });
  }
  const scriptOut = path.join(proj, "03-script", "output.json");
  if (!fs.existsSync(scriptOut)) {
    return NextResponse.json(
      { ok: false, error: "03-script/output.json 이 없습니다. 03번 봇을 먼저 돌리거나 직접 작성하세요." },
      { status: 400 }
    );
  }

  const outDir = path.join(proj, "06-edit-upload");
  fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, "build.log");

  // 진행 중인지 체크 — log 가 최근 60초 내 갱신됐고 build_meta.json 보다 새로면 진행 중으로 본다
  if (fs.existsSync(logPath)) {
    const logM = fs.statSync(logPath).mtimeMs;
    const metaPath = path.join(outDir, "build_meta.json");
    const metaM = fs.existsSync(metaPath) ? fs.statSync(metaPath).mtimeMs : 0;
    const recentlyActive = Date.now() - logM < 60_000;
    if (recentlyActive && logM > metaM) {
      return NextResponse.json({ ok: false, error: "이미 빌드 진행 중입니다." }, { status: 409 });
    }
  }

  // 로그 초기화 — 새 빌드 마커
  const header = `# Build started ${new Date().toISOString()}\n# slug: ${slug}\n# options: force_audio=${forceAudio} force_image_scene=${forceImageScene ?? "-"}\n\n`;
  fs.writeFileSync(logPath, header);

  // 자식 프로세스 spawn — stdio 를 직접 log fd 로 연결 (detached, parent process death 와 독립)
  const scriptFile = path.join(REPO_ROOT, "scripts", "build-video.mjs");
  const logFd = fs.openSync(logPath, "a");
  const args = [scriptFile, slug];
  if (forceAudio) args.push("--force-audio");
  if (forceImageScene) args.push("--force-image", forceImageScene);

  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });
  child.unref();
  fs.closeSync(logFd); // 자식이 inherit 했으니 부모는 닫아도 됨

  return NextResponse.json({
    ok: true,
    slug,
    pid: child.pid,
    logPath: path.relative(REPO_ROOT, logPath),
  });
}
