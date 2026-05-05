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
console.log(`\n✅ Done`);
console.log(`   path: ${finalMp4}`);
console.log(`   size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`   duration: ${finalDur.toFixed(1)}s (estimate was ${scriptOut.total_duration_sec}s)`);

const buildMeta = {
  built_at: new Date().toISOString(),
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
console.log(`   meta: ${path.join(outDir, "build_meta.json")}`);
