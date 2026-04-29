import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, projectDir, shortsMetaPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * POST /api/shorts/create
 * 기존 롱폼 프로젝트를 기반으로 숏폼 프로젝트를 생성한다.
 *
 * body: { parentSlug: string, slugOverride?: string }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parentSlug: string = String(body?.parentSlug || "").trim();
  if (!parentSlug) {
    return NextResponse.json({ ok: false, error: "parentSlug 가 필요합니다." }, { status: 400 });
  }
  const parentDir = path.join(PROJECTS_DIR, parentSlug);
  if (!fs.existsSync(parentDir)) {
    return NextResponse.json({ ok: false, error: `부모 프로젝트가 없습니다: ${parentSlug}` }, { status: 404 });
  }

  const base = String(body?.slugOverride || `${parentSlug}-short`).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-_]{1,80}$/i.test(base)) {
    return NextResponse.json({ ok: false, error: "슬러그 형식 오류 (영문/숫자/-/_, 2~81자)" }, { status: 400 });
  }

  let slug = base;
  let n = 2;
  while (fs.existsSync(path.join(PROJECTS_DIR, slug))) {
    slug = `${base}-${n}`;
    n++;
    if (n > 99) return NextResponse.json({ ok: false, error: "슬러그 충돌" }, { status: 500 });
  }

  const exampleShort = path.join(PROJECTS_DIR, "_example-short");
  const target = path.join(PROJECTS_DIR, slug);

  if (fs.existsSync(exampleShort)) {
    copyDir(exampleShort, target);
  } else {
    fs.mkdirSync(path.join(target, "00-input"), { recursive: true });
  }

  const now = new Date().toISOString();
  const meta = {
    type: "shorts",
    parent_slug: parentSlug,
    created_at: now,
    target_duration_sec: 55,
  };
  fs.writeFileSync(shortsMetaPath(slug), JSON.stringify(meta, null, 2));

  const brief = [
    `# 숏폼 브리프 — ${parentSlug} 기반`,
    "",
    "## 부모 롱폼 프로젝트",
    `- slug: \`${parentSlug}\``,
    "",
    "## 숏폼 목표",
    "- 롱폼의 가장 임팩트 있는 30~59초를 추출해 YouTube Shorts 제작",
    "- 새 이미지/영상 없이 부모 프로젝트 자산 재사용",
    "",
    "## 파이프라인",
    "1. **S1-script**: 롱폼 대본에서 핵심 순간 추출 + 숏폼 대본 작성",
    "2. **S2-audio**: TTS + SRT (59초 미만 필수)",
    "3. **S3-edit**: 롱폼 이미지 재활용, 9:16 CapCut 프로젝트 생성",
    "4. **S4-upload**: YouTube Shorts 업로드 메타데이터 생성",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(target, "00-input", "brief.md"), brief);

  return NextResponse.json({ ok: true, slug, parentSlug });
}

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
