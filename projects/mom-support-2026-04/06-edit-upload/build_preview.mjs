#!/usr/bin/env node
// ffmpeg로 9개 씬 (이미지 + Yuna TTS) 합성 → preview.mp4
// + subtitle.srt 를 hardsub burn-in (한국어)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJ = path.resolve(import.meta.dirname, '..');
const SEG_DIR = path.join(PROJ, '06-edit-upload/segments');
const AUDIO_DIR = path.join(PROJ, '06-edit-upload/audio');
const SCENES_DIR = path.join(PROJ, '05-visual/scenes');
const SRT = path.join(PROJ, '04-audio/subtitle.srt');
const OUT = path.join(PROJ, '06-edit-upload/preview.mp4');
const TMP_CONCAT = path.join(SEG_DIR, 'concat.txt');
const TMP_NOSUB = path.join(PROJ, '06-edit-upload/_nosub.mp4');

fs.mkdirSync(SEG_DIR, { recursive: true });

const script = JSON.parse(fs.readFileSync(path.join(PROJ, '03-script/output.json'), 'utf8'));

function run(label, args, opts = {}) {
  console.log(`[${label}] ffmpeg ${args.slice(0, 6).join(' ')}...`);
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  if (r.status !== 0) {
    console.error(`❌ ${label} 실패`);
    console.error(r.stderr.toString().slice(-1500));
    process.exit(1);
  }
}

console.log('=== 1. 씬별 mp4 생성 (image + audio) ===');
for (const sc of script.scenes) {
  const img = path.join(SCENES_DIR, sc.id, 'bg.jpg');
  const aud = path.join(AUDIO_DIR, `${sc.id}.aiff`);
  const out = path.join(SEG_DIR, `${sc.id}.mp4`);

  if (!fs.existsSync(img)) { console.log(`   ⏳ ${sc.id}: 이미지 아직 없음 → 건너뜀`); continue; }
  if (!fs.existsSync(aud)) { console.log(`   ⚠ ${sc.id}: 음성 없음 → 건너뜀`); continue; }
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) {
    console.log(`   ↷ ${sc.id}: 이미 segment 있음 (skip)`);
    continue;
  }
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
  console.log('\n❌ 합성할 segment가 하나도 없습니다. 이미지 생성이 끝난 후 다시 실행하세요.');
  process.exit(2);
}

console.log(`\n=== 2. ${segments.length}/${script.scenes.length}개 segment concat ===`);
fs.writeFileSync(TMP_CONCAT, segments.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');

run('concat', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', TMP_CONCAT,
  '-c:v', 'libx264', '-preset', 'veryfast',
  '-c:a', 'aac', '-b:a', '192k',
  '-pix_fmt', 'yuv420p',
  TMP_NOSUB]);

console.log('\n=== 3. 자막 처리 ===');
// brew ffmpeg에 libass가 빠져있어 hardsub burn-in 불가.
// 대신 SRT를 mp4 컨테이너에 mov_text 트랙으로 묶어서 soft-sub 형태로 포함시킴.
// QuickTime Player·VLC·CapCut 모두 자막 ON/OFF 가능.
const WORK = path.join(PROJ, '06-edit-upload');
const SRT_LOCAL = path.join(WORK, '_subtitle.srt');
fs.copyFileSync(SRT, SRT_LOCAL);

try {
  run('softsub', ['-y', '-loglevel', 'error',
    '-i', '_nosub.mp4',
    '-i', '_subtitle.srt',
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-c:s', 'mov_text',
    '-metadata:s:s:0', 'language=kor',
    '-metadata:s:s:0', 'title=한국어',
    '-disposition:s:0', 'default',
    'preview.mp4'], { cwd: WORK });
  console.log('  ✓ SRT를 mp4의 자막 트랙으로 임베드 (QuickTime/VLC/CapCut에서 ON/OFF)');
} finally {
  if (fs.existsSync(SRT_LOCAL)) fs.unlinkSync(SRT_LOCAL);
}

fs.unlinkSync(TMP_NOSUB);

console.log(`\n=== 완료 ===`);
console.log(`📁 ${OUT}`);
const stat = fs.statSync(OUT);
console.log(`   ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]);
console.log(`   길이: ${parseFloat(probe.stdout.toString()).toFixed(1)} 초`);
console.log(`\nopen "${OUT}" 으로 미리보기 가능`);
