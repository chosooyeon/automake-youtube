/**
 * 인스타툰 카드 렌더 (1080×1080).
 *
 * 이미지 생성 API 를 쓰지 않는다. 이미 만들어 둔 캐릭터 표정 에셋(admin/data/toon/assets/)을
 * 배경·텍스트와 로컬에서 합성만 하므로 비용이 0원이고 편마다 그림체가 흔들리지 않는다.
 *
 * 사용: node scripts/toon-card.mjs <out_dir>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "../admin/node_modules/@napi-rs/canvas/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 1080;
const PAD = 96;

for (const [file, w] of [["Pretendard-Bold.ttf", 700], ["Pretendard-SemiBold.ttf", 600], ["Pretendard-Regular.ttf", 400]]) {
  GlobalFonts.registerFromPath(path.join(ROOT, "shared/fonts", file), "Pretendard");
}

// 글이 주인공이므로 배경은 채도를 최대한 낮춘다
const C = { bg: "#F6F3EE", ink: "#2E2A26", soft: "#9A9188", accent: "#7BA7C7" };


/**
 * 캐릭터 에셋의 흰 배경을 투명하게 만든다.
 * Gemini 앱·프로크리에이트에서 내보낸 그림은 대개 배경이 흰색이라 그대로 얹으면 크림색 배경 위에 흰 네모가 뜬다.
 * 몸통 채움색도 거의 흰색이라 "밝은 픽셀 전부 제거"는 캐릭터를 파먹는다 →
 * 테두리에서 연결된 영역만 flood fill 로 지운다.
 */
function keyOutBackground(img) {
  const w = img.width, h = img.height;
  const c = createCanvas(w, h);
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h);
  const px = d.data;
  const bright = (i) => px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let i = 0; i < w; i++) { stack.push(i, (h - 1) * w + i); }
  for (let j = 0; j < h; j++) { stack.push(j * w, j * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    const i = p * 4;
    if (!bright(i)) continue;
    seen[p] = 1;
    px[i + 3] = 0;
    const px_ = p % w, py_ = (p - px_) / w;
    if (px_ > 0) stack.push(p - 1);
    if (px_ < w - 1) stack.push(p + 1);
    if (py_ > 0) stack.push(p - w);
    if (py_ < h - 1) stack.push(p + w);
  }
  x.putImageData(d, 0, 0);
  return c;
}

function wrap(ctx, text, maxW) {
  // 한국어는 글자 단위로 끊으면 어절이 쪼개진다 → 공백 우선, 넘칠 때만 글자 단위
  const out = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width <= maxW) { line = t; continue; }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) { line = word; continue; }
      line = "";
      for (const ch of word) {
        if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
        else line += ch;
      }
    }
    out.push(line);
  }
  // 고아 어절: 마지막 줄에 한 어절만 남으면 앞줄에서 하나 내려 균형을 맞춘다
  if (out.length >= 2) {
    const last = out[out.length - 1], prev = out[out.length - 2];
    if (!last.includes(" ") && prev.includes(" ")) {
      const w = prev.split(" ");
      const moved = w.pop();
      if (ctx.measureText(moved + " " + last).width <= maxW) {
        out[out.length - 2] = w.join(" ");
        out[out.length - 1] = moved + " " + last;
      }
    }
  }
  return out;
}

function wobblyUnderline(ctx, x, y, w) {
  ctx.save();
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  for (let t = 0; t <= w; t += 4) ctx[t ? "lineTo" : "moveTo"](x + t, y + Math.sin(t / 26) * 2.6);
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx, text, { x, y, maxW, size, weight = 400, color = C.ink, lh = 1.65, align = "left", hi = "" }) {
  ctx.font = `${weight} ${size}px "Pretendard"`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  const lines = wrap(ctx, text, maxW);
  lines.forEach((l, i) => {
    const ly = y + i * size * lh;
    // 밑줄을 글자보다 먼저 깔아야 글자가 위에 온다
    if (hi && l.includes(hi)) {
      const pre = l.slice(0, l.indexOf(hi));
      const x0 = align === "center" ? x - ctx.measureText(l).width / 2 + ctx.measureText(pre).width : x + ctx.measureText(pre).width;
      wobblyUnderline(ctx, x0, ly + size * 0.12, ctx.measureText(hi).width);
    }
    ctx.fillText(l, x, ly);
  });
  return lines.length * size * lh;
}


/**
 * 연출 기호 — 캐릭터 주변에 떠 있는 만화 기호는 AI 가 아니라 여기서 그린다.
 * 에셋에 구워두면 기호 없는 버전이 필요할 때 다시 뽑아야 하고, 말풍선 안 한글이 뭉개진다.
 */
function overlay(ctx, key, o = {}) {
  const { x = SIZE / 2, y = 300, s = 1, text = "" } = o;
  ctx.save();
  ctx.strokeStyle = C.ink;
  ctx.fillStyle = C.ink;
  ctx.lineWidth = 3 * s;
  ctx.lineCap = "round";
  if (key === "wave3") {
    for (let i = 0; i < 3; i++) {
      const yy = y + i * 26 * s, w = (58 - i * 12) * s;
      ctx.beginPath();
      for (let t = 0; t <= w; t += 2) ctx[t ? "lineTo" : "moveTo"](x - w / 2 + t, yy + Math.sin(t / (7 * s)) * 5 * s);
      ctx.stroke();
    }
  } else if (key === "sweat") {
    for (const [dx, dy, r] of [[0, 0, 13], [26, 20, 9]]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * s, y + (dy - r * 1.5) * s);
      ctx.quadraticCurveTo(x + (dx + r) * s, y + (dy + r * 0.6) * s, x + dx * s, y + (dy + r) * s);
      ctx.quadraticCurveTo(x + (dx - r) * s, y + (dy + r * 0.6) * s, x + dx * s, y + (dy - r * 1.5) * s);
      ctx.stroke();
    }
  } else if (key === "lines") {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r0 = 92 * s, r1 = (i % 2 ? 124 : 138) * s;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
  } else if (key === "spiral") {
    ctx.beginPath();
    for (let t = 0; t < 7; t += 0.06) ctx[t ? "lineTo" : "moveTo"](x + Math.cos(t * 2) * t * 5 * s, y + Math.sin(t * 2) * t * 5 * s);
    ctx.stroke();
  } else if (key === "bubbles") {
    // 물에 잠긴 느낌 — 배경 전체에 떠오르는 기포. 캐릭터보다 뒤에 그린다
    ctx.strokeStyle = "#B9C9D4";
    for (let i = 0; i < 26; i++) {
      const bx = ((i * 137) % SIZE), by = ((i * 311) % SIZE), r = 6 + ((i * 53) % 26);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (key === "bubble") {
    ctx.font = `600 ${30 * s}px "Pretendard"`;
    const w = Math.max(ctx.measureText(text).width + 56 * s, 120 * s), h = 78 * s, bx = x - w / 2, by = y - h;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 26 * s);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // 꼬리
    ctx.moveTo(x - 12 * s, by + h - 2);
    ctx.lineTo(x + 4 * s, by + h + 22 * s);
    ctx.lineTo(x + 16 * s, by + h - 2);
    ctx.closePath();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    ctx.fillText(text, x, by + h / 2 + 11 * s);
  }
  ctx.restore();
}

function autoSize(text) {
  const n = text.replace(/\s/g, "").length;
  return n <= 18 ? 66 : n <= 34 ? 56 : n <= 70 ? 46 : 40;
}

async function card({ kind, text, charFile, index, total, variant, ovKey, ovText, hi }) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 기포는 배경 연출이라 캐릭터보다 뒤에 깔린다
  if (ovKey === "bubbles") overlay(ctx, "bubbles");

  let ovX = SIZE / 2, ovY = 300;
  const char = charFile ? keyOutBackground(await loadImage(charFile)) : null;
  const drawChar = (cx, cy, h) => {
    if (!char) return;
    const w = (char.width / char.height) * h;
    ctx.drawImage(char, cx - w / 2, cy - h, w, h);
  };

  if (kind === "cover") {
    drawChar(SIZE / 2, SIZE - PAD - 40, 420);
    ctx.textAlign = "center";
    drawText(ctx, text, { x: SIZE / 2, y: 300, maxW: SIZE - PAD * 2, size: 68, weight: 700, lh: 1.45, align: "center" });
    ctx.font = `400 26px "Pretendard"`;
    ctx.fillStyle = C.soft;
    ctx.fillText("넘겨서 읽기 →", SIZE / 2, SIZE - 52);
    ovX = SIZE - PAD - 130; ovY = SIZE - PAD - 420;
  } else if (variant === "A") {
    // A: 글 위 · 그림 아래 (글이 먼저 읽힌다)
    drawText(ctx, text, { x: PAD, y: PAD + 150, maxW: SIZE - PAD * 2 - 40, size: autoSize(text), weight: 600, lh: 1.75, hi });
    drawChar(SIZE - PAD - 130, SIZE - PAD + 10, 400);
    ovX = SIZE - PAD - 250; ovY = SIZE - PAD - 400;
  } else {
    // B: 그림 크게 · 글 아래 (감정이 먼저 온다)
    drawChar(SIZE / 2, SIZE - 300, 460);
    drawText(ctx, text, { x: SIZE / 2, y: SIZE - 250, maxW: SIZE - PAD * 2, size: Math.min(autoSize(text), 52), weight: 600, lh: 1.7, align: "center", hi });
    ovX = SIZE / 2 - 135; ovY = 335;
  }

  if (ovKey && ovKey !== "bubbles") {
    // 기호는 캐릭터 머리 위. 위치는 컷마다 조절 가능하다 (에셋에 구워두면 못 바꾼다)
    overlay(ctx, ovKey, { x: ovX, y: ovY, s: 1, text: ovText ?? "" });
  }

  if (kind !== "cover") {
    ctx.font = `400 24px "Pretendard"`;
    ctx.fillStyle = C.soft;
    ctx.textAlign = "right";
    ctx.fillText(`${index} / ${total}`, SIZE - PAD, PAD);
  }
  return canvas.toBuffer("image/png");
}

const outDir = process.argv[2] && process.argv[2] !== "-" ? process.argv[2] : path.join(ROOT, "admin/data/toon/out");
fs.mkdirSync(outDir, { recursive: true });

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "admin/data/toon/assets.json"), "utf8"));
const base = meta.assets.find((a) => a.base) ?? meta.assets[0];
const pick = (expr) => {
  const a = meta.assets.find((x) => x.expression === expr);
  if (expr && !a) console.log("  (에셋 없음 → 기준 캐릭터로 대체:", expr + ")");
  return path.join(ROOT, "admin/data/toon/assets", (a ?? base).file);
};

const slug = process.argv[3] ?? "anxiety";
const ep = JSON.parse(fs.readFileSync(path.join(ROOT, "admin/data/toon/episodes", slug + ".json"), "utf8"));
const jobs = ep.cuts.map((c, i) => ({
  name: String(i + 1).padStart(2, "0") + "-" + (c.expr || "cut"),
  kind: c.kind, variant: c.variant, text: c.text, expr: c.expr,
  ovKey: c.ov, ovText: c.ovText, hi: c.hi, index: i + 1, total: ep.cuts.length,
}));

for (const j of jobs) {
  const buf = await card({ ...j, charFile: pick(j.expr) });
  fs.writeFileSync(path.join(outDir, `${j.name}.png`), buf);
  console.log("→", path.join(outDir, `${j.name}.png`));
}
