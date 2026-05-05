import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { briefPath, projectDir, PROJECTS_DIR } from "@/lib/paths";
import { copyExampleProject } from "@/lib/projects";
import { QUEUE_DIR, buildBriefMarkdown, moveQueueToArchive, type TopicCandidate } from "@/lib/topics";
import { writeChannelConfigSnapshot } from "@/lib/niche";

export const dynamic = "force-dynamic";

/**
 * promote: 후보 1개를 골라서 자동으로 프로젝트 폴더 + brief.md 를 만든다.
 *
 * body: {
 *   candidateIndex: number,            // queue 파일 안 candidates[] 인덱스
 *   slugOverride?: string,             // 사용자가 슬러그를 직접 바꾸고 싶을 때
 * }
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const candidateIndex: number = Number.isInteger(body?.candidateIndex) ? body.candidateIndex : 0;
  const slugOverride: string | undefined = body?.slugOverride
    ? String(body.slugOverride).trim()
    : undefined;

  const queueFile = path.join(QUEUE_DIR, `${params.id}.json`);
  if (!fs.existsSync(queueFile)) {
    return NextResponse.json({ ok: false, error: `queue 파일 없음: ${params.id}` }, { status: 404 });
  }

  let queueDoc: any;
  try {
    queueDoc = JSON.parse(fs.readFileSync(queueFile, "utf8"));
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `JSON 파싱 실패: ${e?.message}` }, { status: 500 });
  }

  const cands: TopicCandidate[] = Array.isArray(queueDoc?.candidates) ? queueDoc.candidates : [];
  if (!cands[candidateIndex]) {
    return NextResponse.json({ ok: false, error: `candidates[${candidateIndex}] 없음` }, { status: 400 });
  }
  const candidate = cands[candidateIndex];

  let slug = (slugOverride || candidate.slug_suggestion || "").toLowerCase();
  if (!slug || !/^[a-z0-9][a-z0-9-_]{1,60}$/i.test(slug)) {
    return NextResponse.json({ ok: false, error: `잘못된 슬러그: ${slug}` }, { status: 400 });
  }
  // 충돌 시 -2, -3 자동
  let final = slug;
  let n = 2;
  while (fs.existsSync(path.join(PROJECTS_DIR, final))) {
    final = `${slug}-${n}`;
    n++;
    if (n > 99) return NextResponse.json({ ok: false, error: "슬러그 충돌" }, { status: 500 });
  }
  slug = final;

  const r = copyExampleProject(slug);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 500 });

  // brief.md 자동 작성
  fs.mkdirSync(path.join(projectDir(slug), "00-input"), { recursive: true });
  fs.writeFileSync(briefPath(slug), buildBriefMarkdown(candidate, slug));

  // niche: queue 문서에 niche 가 적혀 있으면 그걸로, 없으면 active_niche 사용
  const queueNiche: string | undefined =
    typeof queueDoc?.niche === "string" && queueDoc.niche.trim() ? queueDoc.niche.trim() : undefined;
  const snap = writeChannelConfigSnapshot(slug, queueNiche);

  // queue → archive
  const archivePath = moveQueueToArchive({
    queueId: params.id,
    candidate,
    createdProject: `projects/${slug}`,
    slug,
  });

  return NextResponse.json({
    ok: true,
    slug,
    niche: snap.niche,
    briefPath: `projects/${slug}/00-input/brief.md`,
    archivedTo: path.relative(process.cwd(), archivePath),
  });
}
