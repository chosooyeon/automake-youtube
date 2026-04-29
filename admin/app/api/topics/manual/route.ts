import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { briefPath, projectDir, PROJECTS_DIR } from "@/lib/paths";
import { copyExampleProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

/**
 * POST /api/topics/manual
 * 사용자가 직접 주제를 입력해 프로젝트를 생성한다 (AI 추천 없이).
 *
 * body: {
 *   slug: string
 *   topic: string
 *   audience?: string
 *   promise?: string
 *   must_cover?: string[]
 *   primary_sources?: string[]
 *   deadline_date?: string
 *   why_now?: string
 * }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const slugRaw: string = String(body?.slug || "").trim().toLowerCase();
  if (!slugRaw || !/^[a-z0-9][a-z0-9-_]{1,60}$/i.test(slugRaw)) {
    return NextResponse.json({ ok: false, error: "슬러그가 비어있거나 형식이 잘못됐습니다. (영문/숫자/-/_, 2~61자)" }, { status: 400 });
  }

  const topic: string = String(body?.topic || "").trim();
  if (!topic) {
    return NextResponse.json({ ok: false, error: "topic 이 비어있습니다." }, { status: 400 });
  }

  // 슬러그 충돌 시 -2, -3 자동
  let slug = slugRaw;
  let n = 2;
  while (fs.existsSync(path.join(PROJECTS_DIR, slug))) {
    slug = `${slugRaw}-${n}`;
    n++;
    if (n > 99) return NextResponse.json({ ok: false, error: "슬러그 충돌" }, { status: 500 });
  }

  const r = copyExampleProject(slug);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 500 });

  fs.mkdirSync(path.join(projectDir(slug), "00-input"), { recursive: true });

  const audience: string = String(body?.audience || "").trim();
  const promise: string = String(body?.promise || "").trim();
  const mustCover: string[] = Array.isArray(body?.must_cover) ? body.must_cover.map(String) : [];
  const sources: string[] = Array.isArray(body?.primary_sources) ? body.primary_sources.map(String) : [];
  const deadlineDate: string = String(body?.deadline_date || "").trim();
  const whyNow: string = String(body?.why_now || "").trim();

  const lines: string[] = [];
  lines.push(`# 영상 브리프 — ${topic}`);
  lines.push("");
  lines.push("## 주제");
  lines.push(`- ${topic}`);
  if (whyNow) {
    lines.push("");
    lines.push("## 왜 지금?");
    lines.push(`- ${whyNow}`);
  }
  lines.push("");
  lines.push("## 타깃");
  lines.push(`- ${audience || "TBD"}`);
  lines.push("");
  lines.push("## 길이");
  lines.push("- 540 초 (8~10분 sweet spot)");
  lines.push("");
  lines.push("## 약속 (시청자가 끝까지 보면 가져갈 가치)");
  lines.push(`- ${promise || "TBD"}`);
  if (mustCover.length > 0) {
    lines.push("");
    lines.push("## 꼭 다뤄야 할 포인트");
    for (const p of mustCover) lines.push(`- ${p}`);
  }
  lines.push("");
  lines.push("## 절대 금지");
  lines.push("- (config/global.json.brand.ban_words 자동 적용)");
  if (sources.length > 0) {
    lines.push("");
    lines.push("## 자료 소스");
    for (const s of sources) lines.push(`- ${s}`);
  }
  if (deadlineDate) {
    lines.push("");
    lines.push("## 데드라인 / 시즌");
    lines.push(`- 데드라인: ${deadlineDate}`);
  }
  lines.push("");
  lines.push("## 자동 생성 메타");
  lines.push(`- slug: \`${slug}\``);
  lines.push(`- 입력방식: 수동`);
  lines.push("");

  fs.writeFileSync(briefPath(slug), lines.join("\n"));

  return NextResponse.json({ ok: true, slug, briefPath: `projects/${slug}/00-input/brief.md` });
}
