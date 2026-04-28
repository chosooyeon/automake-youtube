#!/usr/bin/env node
// macOS 내장 say 명령으로 한국어 TTS (Yuna) 음성 9개 생성

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJ = path.resolve(import.meta.dirname, '..');
const audioDir = path.join(PROJ, '06-edit-upload/audio');
fs.mkdirSync(audioDir, { recursive: true });

const script = JSON.parse(fs.readFileSync(path.join(PROJ, '03-script/output.json'), 'utf8'));

console.log(`=== 한국어 TTS 음성 생성 (보이스: Yuna, 9개 씬) ===\n`);

for (const sc of script.scenes) {
  const aiff = path.join(audioDir, `${sc.id}.aiff`);
  if (fs.existsSync(aiff) && fs.statSync(aiff).size > 1000) {
    console.log(` ↷ ${sc.id}: 이미 있음 (skip)`);
    continue;
  }
  console.log(` · ${sc.id} (${sc.role}, ~${sc.estimated_duration_sec}s)`);
  const t0 = Date.now();
  // -r 200: 한국어 200 wpm, 자연스러운 정보형 톤
  const r = spawnSync('say', ['-v', 'Yuna', '-r', '200', '-o', aiff, sc.narration], { stdio: 'inherit' });
  if (r.status !== 0) { console.log(`   ❌ ${sc.id}: 실패`); continue; }
  const ms = Date.now() - t0;
  const sz = fs.statSync(aiff).size;
  console.log(`   ✓ ${path.basename(aiff)} (${(sz/1024).toFixed(0)} KB, ${ms} ms)`);
}

console.log(`\n=== 완료 ===\n${audioDir}\n`);
