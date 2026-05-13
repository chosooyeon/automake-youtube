import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { SHARED_DIR } from "@/lib/paths";
import { CARD_COLORS, type CategoryDef } from "./categories";
import {
  CARD_SIZE,
  layoutToCommands,
  type CardSpec,
  type DrawCmd,
} from "./card-layouts";

let fontsRegistered = false;
const FONT_FAMILY = "Pretendard";

function ensureFonts(): void {
  if (fontsRegistered) return;
  const fontsDir = path.join(SHARED_DIR, "fonts");
  const weights: Array<{ file: string; weight: number }> = [
    { file: "Pretendard-Bold.ttf", weight: 700 },
    { file: "Pretendard-SemiBold.ttf", weight: 600 },
    { file: "Pretendard-Regular.ttf", weight: 400 },
  ];
  for (const w of weights) {
    const fp = path.join(fontsDir, w.file);
    if (!fs.existsSync(fp)) {
      throw new Error(
        `Pretendard 폰트 파일이 없습니다: ${fp}\n` +
          `shared/fonts/ 에 Pretendard-Bold/SemiBold/Regular.ttf 가 있어야 합니다.`
      );
    }
    GlobalFonts.registerFromPath(fp, FONT_FAMILY);
  }
  fontsRegistered = true;
}

function setFont(ctx: SKRSContext2D, size: number, weight: "Bold" | "SemiBold" | "Regular"): void {
  const w = weight === "Bold" ? 700 : weight === "SemiBold" ? 600 : 400;
  ctx.font = `${w} ${size}px "${FONT_FAMILY}"`;
}

/** 캔버스 측정 기반 줄바꿈. 명시적 \n 도 존중. */
function wrapLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxLines?: number
): string[] {
  const explicit = text.split(/\n/);
  const out: string[] = [];
  for (const part of explicit) {
    if (out.length === (maxLines ?? Infinity)) break;
    if (ctx.measureText(part).width <= maxWidth) {
      out.push(part);
      continue;
    }
    // 한국어 자모 + 영문 혼합 대응: 문자 단위 줄바꿈 (단, 공백 우선)
    const chunks = part.split(/(\s+)/);
    let line = "";
    for (const ch of chunks) {
      const next = line + ch;
      if (ctx.measureText(next).width <= maxWidth) {
        line = next;
      } else if (ctx.measureText(ch).width > maxWidth) {
        // 한 단어가 maxWidth 초과 → 문자 단위로 쪼개기
        if (line) out.push(line.trimEnd());
        line = "";
        let buf = "";
        for (const c of ch) {
          if (ctx.measureText(buf + c).width <= maxWidth) {
            buf += c;
          } else {
            out.push(buf);
            buf = c;
            if (out.length === (maxLines ?? Infinity)) break;
          }
        }
        line = buf;
      } else {
        if (line) out.push(line.trimEnd());
        line = ch.trimStart();
      }
      if (out.length === (maxLines ?? Infinity)) break;
    }
    if (line && out.length < (maxLines ?? Infinity)) out.push(line.trimEnd());
    if (out.length >= (maxLines ?? Infinity)) break;
  }
  if (maxLines && out.length > maxLines) out.length = maxLines;
  // 마지막 줄이 잘렸을 가능성 표시 (말줄임)
  if (maxLines && explicit.join("\n").length > out.join("\n").length && out.length === maxLines) {
    const last = out[out.length - 1];
    let trimmed = last;
    while (trimmed && ctx.measureText(trimmed + "…").width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    out[out.length - 1] = trimmed + "…";
  }
  return out;
}

function drawText(ctx: SKRSContext2D, cmd: Extract<DrawCmd, { kind: "text" }>): void {
  setFont(ctx, cmd.fontSize, cmd.weight);
  ctx.fillStyle = cmd.color;
  ctx.textBaseline = "top";
  const align = cmd.align ?? "left";
  const lineHeight = cmd.fontSize * (cmd.lineHeight ?? 1.3);
  const lines = wrapLines(ctx, cmd.text, cmd.maxWidth, cmd.maxLines);
  let y = cmd.y;
  for (const line of lines) {
    let x = cmd.x;
    if (align === "center") {
      const w = ctx.measureText(line).width;
      x = cmd.x + (cmd.maxWidth - w) / 2;
    } else if (align === "right") {
      const w = ctx.measureText(line).width;
      x = cmd.x + (cmd.maxWidth - w);
    }
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

function drawRect(ctx: SKRSContext2D, cmd: Extract<DrawCmd, { kind: "rect" }>): void {
  ctx.fillStyle = cmd.color;
  const r = cmd.radius ?? 0;
  if (r <= 0) {
    ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height);
    return;
  }
  const { x, y, width, height } = cmd;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawBullet(ctx: SKRSContext2D, cmd: Extract<DrawCmd, { kind: "bullet" }>): void {
  // 작은 둥근 점 + 텍스트
  const dotR = Math.max(6, Math.floor(cmd.fontSize / 5));
  const dotCx = cmd.x + dotR;
  const dotCy = cmd.y + Math.floor(cmd.fontSize * 0.55);
  ctx.beginPath();
  ctx.fillStyle = cmd.dotColor;
  ctx.arc(dotCx, dotCy, dotR, 0, Math.PI * 2);
  ctx.fill();

  const textX = cmd.x + dotR * 2 + 18;
  drawText(ctx, {
    kind: "text",
    text: cmd.text,
    x: textX,
    y: cmd.y,
    maxWidth: cmd.maxWidth - (textX - cmd.x),
    fontSize: cmd.fontSize,
    weight: "Regular",
    color: cmd.color,
    align: "left",
    lineHeight: 1.4,
    maxLines: 2,
  });
}

async function paintBackground(
  ctx: SKRSContext2D,
  backgroundPng: Buffer | null
): Promise<void> {
  // 베이스 배경 (배경 이미지 실패 대비)
  ctx.fillStyle = CARD_COLORS.background;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  if (backgroundPng) {
    try {
      const img = await loadImage(backgroundPng);
      // 1080x1080 에 cover-fit
      const ratio = Math.max(CARD_SIZE / img.width, CARD_SIZE / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      const dx = (CARD_SIZE - dw) / 2;
      const dy = (CARD_SIZE - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch (e) {
      // 배경 디코딩 실패 시 단색 유지
    }
  }
  // 가독성용 살짝 밝은 오버레이 (오프화이트 78%)
  ctx.fillStyle = CARD_COLORS.overlayWhite;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
}

export interface RenderInput {
  spec: CardSpec;
  category: CategoryDef;
  /** Gemini 등으로 미리 받은 PNG 버퍼. 없으면 단색 배경. */
  backgroundPng: Buffer | null;
}

export async function renderCardPng(input: RenderInput): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(CARD_SIZE, CARD_SIZE);
  const ctx = canvas.getContext("2d");
  await paintBackground(ctx, input.backgroundPng);

  const cmds = layoutToCommands(input.spec, input.category);
  for (const c of cmds) {
    if (c.kind === "text") drawText(ctx, c);
    else if (c.kind === "rect") drawRect(ctx, c);
    else if (c.kind === "bullet") drawBullet(ctx, c);
  }
  return canvas.toBuffer("image/png");
}
