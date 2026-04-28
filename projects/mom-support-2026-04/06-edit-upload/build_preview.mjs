#!/usr/bin/env node
// 9개 씬을 image+TTS audio로 합성 → preview.mp4 (오디오 실측 길이 기반)
// + subtitle_lines를 audio 실측 길이에 글자수 비례로 다시 분배 → 정확히 동기화된 자막
// + ASS로 변환·한국어 폰트 패치 후 영상에 하드섭 → final.mp4
//
// 핵심 픽스:
//   - brew ffmpeg가 .aiff 길이를 잘못 처리해서 segment가 짧아지는 버그 회피
//     → 정적 ffmpeg(tools/ffmpeg, libass 포함)로 강제
//   - 자막 SRT는 script.estimated_duration_sec(추정) 기준이라 음성과 어긋남
//     → 각 씬의 audio 실측 길이로 다시 만든 후 subtitle_lines 글자수 비례 분배

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';

const FF = '/Users/chosooyeon/Documents/automake-youtube/tools/ffmpeg';
const PROJ = path.resolve(import.meta.dirname, '..');
const SEG_DIR = path.join(PROJ, '06-edit-upload/segments');
const AUDIO_DIR = path.join(PROJ, '06-edit-upload/audio');
const SCENES_DIR = path.join(PROJ, '05-visual/scenes');
const WORK = path.join(PROJ, '06-edit-upload');
const TMP_CONCAT = path.join(SEG_DIR, 'concat.txt');
const TMP_NOSUB = path.join(WORK, '_nosub.mp4');
const SRT_OUT = path.join(WORK, '_subtitle.srt');
const ASS_OUT = path.join(WORK, '_subtitle.ass');
const FINAL_NOSUB = path.join(WORK, 'final_nosub.mp4');
const FINAL = path.join(WORK, 'final.mp4');

fs.mkdirSync(SEG_DIR, { recursive: true });
const script = JSON.parse(fs.readFileSync(path.join(PROJ, '03-script/output.json'), 'utf8'));

function run(label, args, opts = {}) {
  const r = spawnSync(FF, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  if (r.status !== 0) {
    console.error(`❌ ${label} 실패`);
    console.error(r.stderr.toString().slice(-2000));
    process.exit(1);
  }
}

function aiffDuration(file) {
  const out = execSync(`afinfo "${file}"`, { encoding: 'utf8' });
  const m = out.match(/estimated duration:\s*([\d.]+)/);
  if (!m) throw new Error(`afinfo 실패: ${file}`);
  return parseFloat(m[1]);
}

function fmtSrtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

console.log('=== 1. 씬별 segment mp4 재빌드 (정적 ffmpeg) ===');
for (const sc of script.scenes) {
  const img = path.join(SCENES_DIR, sc.id, 'bg.jpg');
  const aud = path.join(AUDIO_DIR, `${sc.id}.aiff`);
  const out = path.join(SEG_DIR, `${sc.id}.mp4`);
  if (!fs.existsSync(img)) { console.log(`   ⏳ ${sc.id}: 이미지 없음 → 건너뜀`); continue; }
  if (!fs.existsSync(aud)) { console.log(`   ⚠ ${sc.id}: 음성 없음 → 건너뜀`); continue; }
  console.log(` · ${sc.id}`);
  run(sc.id, [
    '-y', '-loglevel', 'error',
    '-loop', '1', '-i', img,
    '-i', aud,
    '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xFFE4E6,fps=30',
    '-shortest',
    out
  ]);
}

const segments = script.scenes
  .map(s => path.join(SEG_DIR, `${s.id}.mp4`))
  .filter(p => fs.existsSync(p) && fs.statSync(p).size > 10000);

if (segments.length === 0) {
  console.log('\n❌ 합성할 segment 없음.'); process.exit(2);
}

console.log(`\n=== 2. ${segments.length}개 segment concat → ${path.basename(TMP_NOSUB)} ===`);
fs.writeFileSync(TMP_CONCAT, segments.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
run('concat', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', TMP_CONCAT,
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  TMP_NOSUB]);

console.log('\n=== 3. audio 실측 길이로 SRT 재계산 ===');
let cursor = 0;
const srtLines = [];
let idx = 1;
for (const sc of script.scenes) {
  const aud = path.join(AUDIO_DIR, `${sc.id}.aiff`);
  if (!fs.existsSync(aud)) continue;
  const dur = aiffDuration(aud);
  const lines = sc.subtitle_lines || [];
  if (lines.length === 0) { cursor += dur; continue; }
  const totalChars = lines.reduce((a,l) => a + Math.max(1, l.length), 0);
  let local = 0;
  for (const line of lines) {
    const w = Math.max(1, line.length) / totalChars;
    const lineDur = dur * w;
    const start = cursor + local;
    const end = cursor + local + lineDur;
    srtLines.push(`${idx++}\n${fmtSrtTime(start)} --> ${fmtSrtTime(end)}\n${line}\n`);
    local += lineDur;
  }
  cursor += dur;
  console.log(` · ${sc.id}: ${dur.toFixed(2)}s, ${lines.length} 라인`);
}
console.log(` ✓ 총 길이: ${cursor.toFixed(2)}s, 자막 ${idx-1}개`);
fs.writeFileSync(SRT_OUT, srtLines.join('\n'));

console.log('\n=== 4. SRT → ASS 변환 + 한국어 폰트 스타일 패치 ===');
run('srt2ass', ['-y', '-loglevel', 'error', '-i', SRT_OUT, ASS_OUT]);
let ass = fs.readFileSync(ASS_OUT, 'utf8');
ass = ass.replace(/PlayResX:\s*\d+/, 'PlayResX: 1920').replace(/PlayResY:\s*\d+/, 'PlayResY: 1080');
ass = ass.replace(
  /Style:\s*Default,[^\n]+/,
  'Style: Default,Apple SD Gothic Neo,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,4,12,0,2,40,40,90,1'
);
fs.writeFileSync(ASS_OUT, ass);
console.log(' ✓ Apple SD Gothic Neo 56pt, 박스 배경, 하단 정렬');

console.log('\n=== 5. final.mp4 (자막 하드섭) ===');
fs.copyFileSync(TMP_NOSUB, FINAL_NOSUB);
run('hardsub', ['-y', '-loglevel', 'error',
  '-i', '_nosub.mp4',
  '-vf', `ass=_subtitle.ass`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-c:a', 'copy',
  'final.mp4'], { cwd: WORK });

fs.unlinkSync(TMP_NOSUB);

const stat = fs.statSync(FINAL);
const durOut = execSync(`"${FF}" -i "${FINAL}" 2>&1 | grep -oE "Duration: [0-9:.]+" | head -1`, { encoding: 'utf8' });
console.log(`\n=== 완료 ===`);
console.log(`📁 ${FINAL}`);
console.log(`   ${(stat.size / 1024 / 1024).toFixed(2)} MB · ${durOut.trim()}`);
console.log(`   백업: final_nosub.mp4 (자막 없음)`);
