#!/usr/bin/env node
// 한 프로젝트의 03-script + 05-visual 산출물을 받아
// (1) Pollinations(Flux) 로 이미지 생성
// (2) Microsoft Edge TTS (msedge-tts) 로 한국어 음성 생성
// (3) ffmpeg 로 자막 없는 final.mp4 합성
// 채널/니치별 음성·속도는 channel_config.apis.tts 에서 읽음.
//
// 사용: node scripts/build-video.mjs <slug> [--force-audio] [--force-image scene-NNN]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const slug = args[0];
if (!slug) {
  console.error("Usage: node scripts/build-video.mjs <slug> [--force-audio] [--force-image scene-NNN]");
  process.exit(1);
}
const forceAudio = args.includes("--force-audio");
const forceImageIdx = args.indexOf("--force-image");
const forceImageScene = forceImageIdx > -1 ? args[forceImageIdx + 1] : null;

const projectDir = path.join(REPO_ROOT, "projects", slug);
const scriptOutPath = path.join(projectDir, "03-script", "output.json");
const visualOutPath = path.join(projectDir, "05-visual", "output.json");
const channelCfgPath = path.join(projectDir, "00-input", "channel_config.json");
if (!fs.existsSync(scriptOutPath)) {
  console.error(`No 03-script/output.json at ${scriptOutPath}`);
  process.exit(1);
}

const scriptOut = JSON.parse(fs.readFileSync(scriptOutPath, "utf8"));
const visualOut = fs.existsSync(visualOutPath)
  ? JSON.parse(fs.readFileSync(visualOutPath, "utf8"))
  : null;
const channelCfg = fs.existsSync(channelCfgPath)
  ? JSON.parse(fs.readFileSync(channelCfgPath, "utf8"))
  : JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "config", "global.json"), "utf8"));

const ttsCfg = channelCfg?.apis?.tts ?? {};
const TTS_VOICE = ttsCfg.voice || "ko-KR-SunHiNeural";
const TTS_RATE = ttsCfg.rate || "-5%";
const TTS_PITCH = ttsCfg.pitch || "+0Hz";
const TTS_VOLUME = ttsCfg.volume || "+0%";

console.log(`▶ Building video for ${slug}`);
console.log(`  scenes: ${scriptOut.scenes.length} / total estimated: ${scriptOut.total_duration_sec}s`);
console.log(`  TTS: ${TTS_VOICE} (rate ${TTS_RATE}, pitch ${TTS_PITCH})`);

const imgDir = path.join(projectDir, "05-visual", "scenes");
const audioDir = path.join(projectDir, "04-audio", "scene_audio");
const clipDir = path.join(projectDir, "06-edit-upload", "scene_clips");
const outDir = path.join(projectDir, "06-edit-upload");
fs.mkdirSync(imgDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(clipDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

function getScenePrompt(scene) {
  const vScene = visualOut?.scenes?.find((s) => s.scene_id === scene.id);
  if (vScene) {
    const imgLayer = (vScene.layers || []).find((l) => l.type === "image");
    if (imgLayer && imgLayer.prompt) return imgLayer.prompt;
  }
  const kw = (scene.b_roll_keywords || []).join(", ");
  const intent = scene.visual_intent || "";
  return `${kw}, ${intent}, cinematic photo, photorealistic, 8k`;
}

const FALLBACK_PROMPTS = {
  "scene-012": "Cozy still life on a warm walnut wooden table, three small ceramic bowls in a row, soft morning light, warm pastel tones, cinematic photo, photorealistic, no text, 8k, summary mood",
};

function getFinalPrompt(scene) {
  return FALLBACK_PROMPTS[scene.id] || getScenePrompt(scene);
}

async function downloadImage(url, dest, timeoutMs = 90000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 automake" },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) throw new Error(`tiny response ${buf.length}b`);
    fs.writeFileSync(dest, buf);
    return buf.length;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`timeout ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function pollinationsURL(prompt, seed = 42) {
  const enc = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${enc}?width=1280&height=720&model=flux&nologo=true&seed=${seed}&enhance=true`;
}

async function genTTSEdge(text, mp3Path) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    rate: TTS_RATE,
    pitch: TTS_PITCH,
    volume: TTS_VOLUME,
  });
  // toFile takes (dirOrPath, text). Using a unique tmp dir per call to avoid name clash.
  const tmpDir = path.join(audioDir, "_tmp_" + path.basename(mp3Path, ".mp3"));
  fs.mkdirSync(tmpDir, { recursive: true });
  const { audioFilePath } = await tts.toFile(tmpDir, text);
  fs.renameSync(audioFilePath, mp3Path);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mp3Path;
}

function runCmd(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: opts.silent ? "pipe" : "inherit", encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exit ${r.status}\n${r.stderr || ""}`);
  }
  return r;
}

function getMediaDuration(file) {
  const r = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ], { encoding: "utf8" });
  return parseFloat(r.stdout.trim());
}

function validateClipHasAudio(file) {
  const r = spawnSync("ffprobe", [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=codec_name",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ], { encoding: "utf8" });
  return r.stdout.trim().length > 0;
}

const sceneClips = [];

for (let i = 0; i < scriptOut.scenes.length; i++) {
  const sc = scriptOut.scenes[i];
  const sceneImgDir = path.join(imgDir, sc.id);
  fs.mkdirSync(sceneImgDir, { recursive: true });
  const imgPath = path.join(sceneImgDir, "img-01.png");
  const audioMp3 = path.join(audioDir, `${sc.id}.mp3`);
  const audioWav = path.join(audioDir, `${sc.id}.wav`);
  const clipPath = path.join(clipDir, `${sc.id}.mp4`);

  const prompt = getFinalPrompt(sc);
  console.log(`\n[${i + 1}/${scriptOut.scenes.length}] ${sc.id} (${sc.role}, ~${sc.estimated_duration_sec}s)`);

  // 1. 이미지
  const forceThis = forceImageScene === sc.id;
  if (!fs.existsSync(imgPath) || forceThis) {
    if (forceThis) console.log(`  📸 image regen (forced)...`);
    else console.log(`  📸 image gen...`);
    let attempt = 0;
    while (true) {
      try {
        attempt++;
        const url = pollinationsURL(prompt, 100 + i + attempt * 17);
        const bytes = await downloadImage(url, imgPath, 90000);
        console.log(`     saved ${(bytes / 1024).toFixed(0)}KB (attempt ${attempt})`);
        break;
      } catch (e) {
        if (attempt >= 4) {
          console.log(`     ❌ all attempts failed (${e.message}). Using solid color fallback.`);
          runCmd("ffmpeg", [
            "-y", "-f", "lavfi",
            "-i", "color=c=#3E2A1A:s=1280x720:d=1",
            "-frames:v", "1",
            imgPath,
          ], { silent: true });
          break;
        }
        console.log(`     retry ${attempt} (${e.message})`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } else {
    console.log(`  📸 image cached`);
  }

  // 2. TTS (Edge TTS — 차분한 한국어 남/여 선택 가능)
  const audioStale = forceAudio || !fs.existsSync(audioWav);
  if (audioStale) {
    console.log(`  🔊 TTS (${TTS_VOICE} @ ${TTS_RATE})...`);
    let ok = false;
    for (let a = 1; a <= 3 && !ok; a++) {
      try {
        await genTTSEdge(sc.narration, audioMp3);
        runCmd("ffmpeg", ["-y", "-i", audioMp3, "-ar", "48000", "-ac", "2", audioWav], { silent: true });
        ok = true;
      } catch (e) {
        console.log(`     retry ${a} (${e.message?.slice(0, 100)})`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!ok) {
      console.error(`     ❌ TTS failed for ${sc.id}. Aborting.`);
      process.exit(1);
    }
  } else {
    console.log(`  🔊 audio cached`);
  }
  const audioDur = getMediaDuration(audioWav);
  if (!audioDur || audioDur < 0.5) {
    console.error(`  ❌ audio too short (${audioDur}s). Re-run with --force-audio.`);
    process.exit(1);
  }
  console.log(`     audio dur: ${audioDur.toFixed(2)}s`);

  // 3. 씬 클립 — 정적 이미지 + 음성. 깜빡임 방지 위해 zoompan 제거.
  //    최소 길이 = 음성 길이. 끝에 0.3s 페이드 아웃.
  const clipStale = !fs.existsSync(clipPath)
    || fs.statSync(clipPath).mtimeMs < fs.statSync(audioWav).mtimeMs
    || fs.statSync(clipPath).mtimeMs < fs.statSync(imgPath).mtimeMs
    || !validateClipHasAudio(clipPath);
  if (clipStale) {
    console.log(`  🎬 clip...`);
    const fadeStart = Math.max(audioDur - 0.3, 0);
    runCmd("ffmpeg", [
      "-y",
      "-loop", "1",
      "-framerate", "30",
      "-i", imgPath,
      "-i", audioWav,
      "-vf", `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fade=t=out:st=${fadeStart.toFixed(2)}:d=0.3,format=yuv420p`,
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-r", "30",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-ac", "2",
      "-shortest",
      "-movflags", "+faststart",
      clipPath,
    ], { silent: true });
    if (!validateClipHasAudio(clipPath)) {
      console.error(`  ❌ clip ${sc.id} has no audio stream. Aborting.`);
      process.exit(1);
    }
  } else {
    console.log(`  🎬 clip cached`);
  }
  const clipDur = getMediaDuration(clipPath);
  sceneClips.push({ id: sc.id, file: clipPath, duration: clipDur });
}

console.log(`\n▶ Concatenating ${sceneClips.length} clips → final.mp4`);
const concatList = path.join(outDir, "concat.txt");
fs.writeFileSync(concatList, sceneClips.map((c) => `file '${c.file.replace(/'/g, "'\\''")}'`).join("\n") + "\n");

const finalMp4 = path.join(outDir, "final.mp4");
// concat 시 -c copy 가 가끔 audio sync 문제 일으키므로 재인코딩으로 안전하게
runCmd("ffmpeg", [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", concatList,
  "-c:v", "libx264",
  "-c:a", "aac",
  "-b:a", "192k",
  "-ar", "48000",
  "-r", "30",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  finalMp4,
], { silent: true });

if (!validateClipHasAudio(finalMp4)) {
  console.error(`❌ final.mp4 has no audio. Something went wrong.`);
  process.exit(1);
}

const finalDur = getMediaDuration(finalMp4);
const stats = fs.statSync(finalMp4);

// 영상 제목 기반 파일명 복사
function sanitizeFilename(s, maxLen = 100) {
  return s
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, maxLen);
}
const titledName = sanitizeFilename(scriptOut.title) + ".mp4";
const titledPath = path.join(outDir, titledName);
fs.copyFileSync(finalMp4, titledPath);

console.log(`\n✅ Done`);
console.log(`   📹 ${titledName}`);
console.log(`   📁 ${outDir}`);
console.log(`   size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`   duration: ${finalDur.toFixed(1)}s (estimate was ${scriptOut.total_duration_sec}s)`);

const buildMeta = {
  built_at: new Date().toISOString(),
  output_file: titledName,
  total_scenes: sceneClips.length,
  total_duration_sec: finalDur,
  estimated_total_sec: scriptOut.total_duration_sec,
  scene_clips: sceneClips.map((c) => ({ id: c.id, duration_sec: Number(c.duration.toFixed(2)) })),
  image_provider: "pollinations.ai (flux)",
  tts_provider: `msedge-tts (${TTS_VOICE}, rate ${TTS_RATE})`,
  resolution: "1920x1080",
  fps: 30,
  has_subtitles: false,
  has_bgm: false,
  flicker_fix: "removed zoompan, static image + fade-out 0.3s",
  audio_validated: true,
};
fs.writeFileSync(path.join(outDir, "build_meta.json"), JSON.stringify(buildMeta, null, 2) + "\n");

// upload_metadata.json 자동 생성 (이미 있으면 덮어쓰지 않음)
const metaPath = path.join(outDir, "upload_metadata.json");
if (!fs.existsSync(metaPath)) {
  // 실제 빌드 길이 기준으로 챕터 시간 계산
  let cursor = 0;
  const chapters = [];
  for (const clip of sceneClips) {
    const mm = Math.floor(cursor / 60);
    const ss = Math.floor(cursor % 60);
    const tc = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    const scriptScene = scriptOut.scenes.find((s) => s.id === clip.id);
    if (scriptScene?.headline) {
      chapters.push(`${tc} ${scriptScene.headline}`);
    }
    cursor += clip.duration;
  }

  const ch = channelCfg.channel ?? {};
  const brand = channelCfg.brand ?? {};
  const channelName = (ch.name || "").replace(/\s*\(.*?\)/, "").trim();
  const niche = ch.niche || "";
  const aiDisc = brand.ai_disclosure?.include_in_description || "";
  const outroSig = brand.outro_signature || "";

  const hookScene = scriptOut.scenes.find((s) => s.role === "hook") || scriptOut.scenes[0];
  const ctaScene = scriptOut.scenes.find((s) => s.role === "cta");
  const nextHint = ctaScene?.narration?.match(/다음[^.?!]*?[.?!]/)?.[0]?.trim() || "";

  const descParts = [
    `안녕하세요, ${channelName}입니다.`,
    "",
    `오늘의 한 그릇 ─ ${scriptOut.title}.`,
    "",
  ];
  if (chapters.length) {
    descParts.push("[챕터]");
    descParts.push(...chapters);
    descParts.push("");
  }
  if (niche) {
    descParts.push("[채널]");
    descParts.push(niche);
    descParts.push("");
  }
  if (nextHint) {
    descParts.push(`▶ ${nextHint}`);
    descParts.push("");
  }
  if (outroSig) {
    descParts.push(outroSig);
    descParts.push("");
  }
  // 해시태그 (네이밍은 채널 기본 + 첫 씬 키워드)
  const hashSet = new Set(["심리식탁", "한그릇"]);
  for (const sc of scriptOut.scenes.slice(0, 3)) {
    for (const kw of sc.b_roll_keywords || []) {
      const hangul = kw.match(/[가-힣]+/g);
      if (hangul) hangul.forEach((w) => w.length >= 2 && hashSet.add(w));
    }
  }
  // 카테고리 일반 태그도
  ["심리학", "동양철학", "자기계발", "베스트셀러심리학"].forEach((t) => hashSet.add(t));
  const hashtags = [...hashSet].slice(0, 12);
  descParts.push(hashtags.map((h) => `#${h}`).join(" "));
  descParts.push("");
  if (aiDisc) {
    descParts.push("---");
    descParts.push(aiDisc);
  }

  // 고정 댓글 제안 (CTA 씬의 질문 추출 또는 폴백)
  const ctaQuestion = ctaScene?.narration?.match(/[가-힣\s,]+[?]/)?.[0]?.trim() || "오늘 영상에서 가장 기억에 남은 한 줄은 무엇인가요? 댓글로 남겨주세요.";

  const uploadMeta = {
    title: scriptOut.title,
    description: descParts.join("\n"),
    tags: hashtags.map((h) => h.replace(/^#/, "")),
    chapters,
    pinned_comment_suggestion: ctaQuestion,
    thumbnail_text_overlay_suggestion: hookScene?.headline || scriptOut.title.slice(0, 14),
    category_id: "27",
    _category_note: "27 = Education",
    privacy: "private",
    _privacy_note: "사람 검수 후 YouTube Studio 에서 public 전환",
    made_for_kids: false,
    synthetic_media_label: true,
    channel: {
      name: channelName,
      handle: ch.handle || "",
      niche_id: channelCfg._resolved_niche,
    },
    output_video_file: titledName,
    _human_review_required: [
      "썸네일 1장 제작 (인물 표정 + 굵은 한 단어)",
      "title 더 클릭 잘 되는 후보 검토",
      "description 의 챕터·해시태그 검수",
      "pinned_comment_suggestion 그대로 댓글로 박을지 결정",
    ],
    generated_by: "build-video.mjs (auto)",
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(metaPath, JSON.stringify(uploadMeta, null, 2) + "\n");
  console.log(`   📝 upload_metadata.json (자동 생성, 사람 검수 필요)`);
} else {
  console.log(`   📝 upload_metadata.json (이미 있음 — 보존)`);
}
