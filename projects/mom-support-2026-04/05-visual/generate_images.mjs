#!/usr/bin/env node
// Pollinations.ai (Flux 무료) 로 9개 씬 배경 + 5장 썸네일 자동 생성

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PROJ = path.resolve(import.meta.dirname, '..');

const visual = JSON.parse(fs.readFileSync(path.join(PROJ, '05-visual/output.json'), 'utf8'));
const thumbs = JSON.parse(fs.readFileSync(path.join(PROJ, '06-edit-upload/thumbnails.json'), 'utf8'));

async function downloadImage(prompt, outPath, { width = 1920, height = 1080, seed = 42, model = 'flux' } = {}) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true`;
  const t0 = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${outPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  const ms = Date.now() - t0;
  console.log(`   ✓ ${path.relative(ROOT, outPath)}  (${(buf.length/1024).toFixed(0)} KB, ${ms} ms)`);
}

async function withRetry(fn, label, max = 3) {
  let lastErr;
  for (let i = 1; i <= max; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      console.log(`   ⚠ ${label} 실패 (${i}/${max}): ${e.message}, 5초 후 재시도`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}

console.log('=== 1. 9개 씬 배경 (1920x1080) ===');
for (const sc of visual.scenes) {
  const imgLayer = sc.layers.find(l => l.type === 'image' && l.prompt);
  if (!imgLayer) continue;
  const out = path.join(PROJ, '05-visual/scenes', sc.scene_id, 'bg.jpg');
  if (fs.existsSync(out) && fs.statSync(out).size > 5000) {
    console.log(`   ↷ ${sc.scene_id}: 이미 있음 (skip)`);
    continue;
  }
  console.log(` · ${sc.scene_id}`);
  const seed = parseInt(sc.scene_id.replace(/\D/g, '')) * 11 + 7;
  await withRetry(() => downloadImage(imgLayer.prompt, out, { seed }), sc.scene_id);
}

console.log('\n=== 2. 5장 썸네일 (1280x720) ===');
const thumbOutDir = path.join(PROJ, '06-edit-upload/thumbnails');
fs.mkdirSync(thumbOutDir, { recursive: true });
for (const t of thumbs.candidates) {
  const out = path.join(thumbOutDir, `${t.id}.jpg`);
  if (fs.existsSync(out) && fs.statSync(out).size > 5000) {
    console.log(`   ↷ ${t.id}: 이미 있음 (skip)`);
    continue;
  }
  console.log(` · ${t.id} (${t.concept})`);
  const seed = t.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  await withRetry(() => downloadImage(t.prompt, out, { width: 1280, height: 720, seed }), t.id);
}

const recommended = path.join(thumbOutDir, 'thumb-01-shock.jpg');
const selected = path.join(thumbOutDir, 'selected.jpg');
if (fs.existsSync(recommended) && !fs.existsSync(selected)) {
  fs.copyFileSync(recommended, selected);
  console.log(`\n✓ 1순위 (thumb-01-shock) 를 selected.jpg 로 자동 선택`);
}

console.log('\n=== 완료 ===');
