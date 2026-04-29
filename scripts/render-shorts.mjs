#!/usr/bin/env node
/**
 * render-shorts.mjs
 * 숏폼 렌더링 (롱폼 build_preview.mjs 방식 그대로)
 * 1. say -v Yuna 로 씬별 TTS 생성
 * 2. 씬별 segment mp4 (1080x1920)
 * 3. concat → nosub.mp4
 * 4. 실측 길이로 SRT 재계산 → ASS 변환 + 스타일 패치
 * 5. tools/ffmpeg(libass) 으로 자막 burn-in → short.mp4
 *
 * Usage: node scripts/render-shorts.mjs <slug>
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FF = path.join(REPO_ROOT, "tools", "ffmpeg");
const slug = process.argv[2];
if (!slug) { console.error("Usage: node scripts/render-shorts.mjs <slug>"); process.exit(1); }

const PROJECT_DIR  = path.join(REPO_ROOT, "projects", slug);
const S2_DIR       = path.join(PROJECT_DIR, "S2-audio");
const S3_DIR       = path.join(PROJECT_DIR, "S3-edit");
const SEG_DIR      = path.join(S3_DIR, "segments");
const CONCAT_TXT   = path.join(SEG_DIR, "concat.txt");
const NOSUB_MP4    = path.join(S3_DIR, "_nosub.mp4");
const SRT_OUT      = path.join(S3_DIR, "_subtitle.srt");
const ASS_OUT      = path.join(S3_DIR, "_subtitle.ass");
const FINAL_MP4    = path.join(S3_DIR, "short.mp4");

fs.mkdirSync(SEG_DIR, { recursive: true });

const s2 = JSON.parse(fs.readFileSync(path.join(S2_DIR, "output.json"), "utf8"));
const s3 = JSON.parse(fs.readFileSync(path.join(S3_DIR, "output.json"), "utf8"));

// scene_id → image absolute path
const imgMap = {};
for (const m of (s3.image_mapping || [])) {
  imgMap[m.short_scene_id] = path.join(REPO_ROOT, m.parent_image_path);
}

function run(label, args, opts = {}) {
  const r = spawnSync(FF, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.status !== 0) {
    console.error(`❌ ${label} 실패`);
    console.error(r.stderr.toString().slice(-2000));
    process.exit(1);
  }
}

function aiffDuration(file) {
  const out = execSync(`afinfo "${file}"`, { encoding: "utf8" });
  const m = out.match(/estimated duration:\s*([\d.]+)/);
  if (!m) throw new Error(`afinfo 실패: ${file}`);
  return parseFloat(m[1]);
}

function fmtSrtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}

// ── 1. 씬별 TTS (say -v Yuna) ──
console.log("=== 1. 씬별 TTS 생성 (Yuna) ===");
for (const sc of s2.scenes) {
  const aiff = path.join(SEG_DIR, `${sc.id}.aiff`);
  if (fs.existsSync(aiff) && fs.statSync(aiff).size > 1000) {
    console.log(` ↷ ${sc.id}: 이미 있음 (skip)`);
    continue;
  }
  console.log(` · ${sc.id}`);
  const r = spawnSync("say", ["-v", "Yuna", "-r", "220", "-o", aiff, sc.narration], { stdio: "inherit" });
  if (r.status !== 0) { console.error(`   ❌ ${sc.id}: TTS 실패`); process.exit(1); }
}

// ── 2. 씬별 segment mp4 (1080×1920) ──
console.log("\n=== 2. 씬별 segment mp4 빌드 ===");
for (const sc of s2.scenes) {
  const img  = imgMap[sc.id];
  const aiff = path.join(SEG_DIR, `${sc.id}.aiff`);
  const out  = path.join(SEG_DIR, `${sc.id}.mp4`);
  if (!img || !fs.existsSync(img))   { console.log(`   ⚠ ${sc.id}: 이미지 없음 → 건너뜀`); continue; }
  if (!fs.existsSync(aiff))          { console.log(`   ⚠ ${sc.id}: 음성 없음 → 건너뜀`); continue; }
  console.log(` · ${sc.id}`);
  run(sc.id, [
    "-y", "-loglevel", "error",
    "-loop", "1", "-i", img,
    "-i", aiff,
    "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-pix_fmt", "yuv420p",
    // landscape → portrait: 높이 1920 맞춤 후 가로 중앙 크롭
    "-vf", "scale=-1:1920,crop=1080:1920,fps=30",
    "-shortest",
    out,
  ]);
}

const segments = s2.scenes
  .map(sc => path.join(SEG_DIR, `${sc.id}.mp4`))
  .filter(p => fs.existsSync(p) && fs.statSync(p).size > 10000);

if (segments.length === 0) { console.error("❌ 합성할 segment 없음"); process.exit(2); }

// ── 3. concat ──
console.log(`\n=== 3. ${segments.length}개 segment concat ===`);
fs.writeFileSync(CONCAT_TXT, segments.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
run("concat", [
  "-y", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", CONCAT_TXT,
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k",
  NOSUB_MP4,
]);

// ── 4. 실측 길이로 SRT 재계산 ──
console.log("\n=== 4. 실측 길이 SRT 재계산 ===");
let cursor = 0;
const srtLines = [];
let idx = 1;
for (const sc of s2.scenes) {
  const aiff = path.join(SEG_DIR, `${sc.id}.aiff`);
  if (!fs.existsSync(aiff)) continue;
  const dur = aiffDuration(aiff);
  const cues = sc.subtitle_cues || [];
  if (cues.length === 0) { cursor += dur; continue; }
  const totalChars = cues.reduce((a, c) => a + Math.max(1, c.text.length), 0);
  let local = 0;
  for (const cue of cues) {
    const w = Math.max(1, cue.text.length) / totalChars;
    const cueDur = dur * w;
    srtLines.push(`${idx++}\n${fmtSrtTime(cursor + local)} --> ${fmtSrtTime(cursor + local + cueDur)}\n${cue.text}\n`);
    local += cueDur;
  }
  cursor += dur;
  console.log(` · ${sc.id}: ${dur.toFixed(2)}s, ${cues.length}개 자막`);
}
console.log(` ✓ 총 ${cursor.toFixed(2)}s, 자막 ${idx - 1}개`);
fs.writeFileSync(SRT_OUT, srtLines.join("\n"));

// ── 5. SRT → ASS 변환 + 스타일 패치 ──
console.log("\n=== 5. SRT → ASS 변환 + 스타일 패치 ===");
run("srt2ass", ["-y", "-loglevel", "error", "-i", SRT_OUT, ASS_OUT]);
let ass = fs.readFileSync(ASS_OUT, "utf8");
ass = ass.replace(/PlayResX:\s*\d+/, "PlayResX: 1080").replace(/PlayResY:\s*\d+/, "PlayResY: 1920");
ass = ass.replace(
  /Style:\s*Default,[^\n]+/,
  "Style: Default,Apple SD Gothic Neo,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,4,10,0,2,30,30,80,1"
);
fs.writeFileSync(ASS_OUT, ass);
console.log(" ✓ Apple SD Gothic Neo 52pt, 박스 배경, 하단 정렬");

// ── 6. 자막 burn-in → short.mp4 ──
console.log("\n=== 6. 자막 burn-in (tools/ffmpeg + libass) ===");
run("hardsub", [
  "-y", "-loglevel", "error",
  "-i", NOSUB_MP4,
  "-vf", `ass=${ASS_OUT}`,
  "-c:v", "libx264", "-preset", "medium", "-crf", "20",
  "-c:a", "copy",
  FINAL_MP4,
]);

fs.copyFileSync(NOSUB_MP4, path.join(S3_DIR, "short_nosub.mp4"));
fs.unlinkSync(NOSUB_MP4);

const stat = fs.statSync(FINAL_MP4);
console.log(`\n✅ 완료`);
console.log(`   ${FINAL_MP4}`);
console.log(`   ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
