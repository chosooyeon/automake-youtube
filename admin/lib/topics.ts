import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths";

export const TOPICS_DIR = path.join(REPO_ROOT, "topics");
export const QUEUE_DIR = path.join(TOPICS_DIR, "queue");
export const ARCHIVE_DIR = path.join(TOPICS_DIR, "archive");

export interface TopicCandidate {
  topic_oneliner: string;
  why_now?: string;
  audience?: string;
  promise?: string;
  must_cover?: string[];
  primary_sources?: string[];
  deadline?: { type?: string; date?: string };
  season_tag?: string;
  fitness_score?: number;
  fitness_breakdown?: Record<string, number>;
  estimated_video_length_sec?: number;
  slug_suggestion: string;
  title_seed?: string;
}

export interface TopicQueueFile {
  generated_at: string;
  lookback_days?: number;
  queries_used?: string[];
  sources_consulted?: string[];
  candidates: TopicCandidate[];
  interpretation?: string;
  next_run_recommendation?: string;
}

function ensureDirs() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

export interface QueueEntry {
  id: string; // 파일명 (확장자 제외)
  generatedAt: string;
  candidates: TopicCandidate[];
  interpretation?: string;
  filePath: string;
}

export function listQueue(): QueueEntry[] {
  ensureDirs();
  const out: QueueEntry[] = [];
  for (const f of fs.readdirSync(QUEUE_DIR)) {
    if (!f.endsWith(".json")) continue;
    const fp = path.join(QUEUE_DIR, f);
    try {
      const j = JSON.parse(fs.readFileSync(fp, "utf8")) as TopicQueueFile;
      out.push({
        id: f.replace(/\.json$/, ""),
        generatedAt: j.generated_at,
        candidates: j.candidates ?? [],
        interpretation: j.interpretation,
        filePath: fp,
      });
    } catch {}
  }
  return out.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
}

export function listArchive(): { id: string; topic: string; slug: string; movedAt?: string }[] {
  ensureDirs();
  const out: { id: string; topic: string; slug: string; movedAt?: string }[] = [];
  for (const f of fs.readdirSync(ARCHIVE_DIR)) {
    if (!f.endsWith(".json")) continue;
    const fp = path.join(ARCHIVE_DIR, f);
    try {
      const j = JSON.parse(fs.readFileSync(fp, "utf8"));
      const c: TopicCandidate = j.picked_candidate ?? {};
      out.push({
        id: f.replace(/\.json$/, ""),
        topic: c.topic_oneliner ?? "(제목 없음)",
        slug: j.created_project ? path.basename(j.created_project) : c.slug_suggestion,
        movedAt: j.archived_at,
      });
    } catch {}
  }
  return out.sort((a, b) => (a.movedAt && b.movedAt ? (a.movedAt < b.movedAt ? 1 : -1) : 0));
}

export function buildBriefMarkdown(c: TopicCandidate, slug: string): string {
  const lines: string[] = [];
  lines.push(`# 영상 브리프 — ${c.topic_oneliner}`);
  lines.push("");
  lines.push("## 주제");
  lines.push(`- ${c.topic_oneliner}`);
  if (c.why_now) {
    lines.push("");
    lines.push("## 왜 지금?");
    lines.push(`- ${c.why_now}`);
  }
  lines.push("");
  lines.push("## 타깃");
  lines.push(`- ${c.audience ?? "TBD"}`);
  lines.push("");
  lines.push("## 길이");
  lines.push(`- ${c.estimated_video_length_sec ?? 540} 초 (8~10분 sweet spot)`);
  lines.push("");
  lines.push("## 약속 (시청자가 끝까지 보면 가져갈 가치)");
  lines.push(`- ${c.promise ?? "TBD"}`);
  if (c.must_cover && c.must_cover.length) {
    lines.push("");
    lines.push("## 꼭 다뤄야 할 포인트");
    for (const p of c.must_cover) lines.push(`- ${p}`);
  }
  lines.push("");
  lines.push("## 절대 금지");
  lines.push("- (config/global.json.brand.ban_words 자동 적용)");
  if (c.primary_sources && c.primary_sources.length) {
    lines.push("");
    lines.push("## 자료 소스");
    for (const s of c.primary_sources) lines.push(`- ${s}`);
  }
  if (c.deadline?.date || c.season_tag) {
    lines.push("");
    lines.push("## 데드라인 / 시즌");
    if (c.deadline?.date) lines.push(`- 데드라인: ${c.deadline.type ?? "deadline"} = ${c.deadline.date}`);
    if (c.season_tag) lines.push(`- 시즌 태그: ${c.season_tag}`);
  }
  lines.push("");
  lines.push("## 자동 생성 메타");
  lines.push(`- slug: \`${slug}\``);
  if (c.title_seed) lines.push(`- title_seed: ${c.title_seed}`);
  if (c.fitness_score != null) lines.push(`- fitness_score: ${c.fitness_score}`);
  lines.push("");
  return lines.join("\n");
}

export function moveQueueToArchive(opts: {
  queueId: string;
  candidate: TopicCandidate;
  createdProject: string; // 상대경로 또는 슬러그
  slug: string;
}): string {
  ensureDirs();
  const queueFile = path.join(QUEUE_DIR, `${opts.queueId}.json`);
  if (!fs.existsSync(queueFile)) throw new Error(`queue 파일 없음: ${queueFile}`);
  const j = JSON.parse(fs.readFileSync(queueFile, "utf8"));
  const datePart = new Date().toISOString().slice(0, 10);
  const archiveName = `${datePart}__${opts.slug}.json`;
  const archivePath = path.join(ARCHIVE_DIR, archiveName);
  const archiveDoc = {
    ...j,
    archived_at: new Date().toISOString(),
    picked_candidate: opts.candidate,
    created_project: opts.createdProject,
    source_queue_id: opts.queueId,
  };
  fs.writeFileSync(archivePath, JSON.stringify(archiveDoc, null, 2));
  fs.unlinkSync(queueFile);
  // 사람용 .md 도 같이 이동(있으면)
  const queueMd = path.join(QUEUE_DIR, `${opts.queueId}.md`);
  if (fs.existsSync(queueMd)) {
    fs.renameSync(queueMd, path.join(ARCHIVE_DIR, `${datePart}__${opts.slug}.md`));
  }
  return archivePath;
}
