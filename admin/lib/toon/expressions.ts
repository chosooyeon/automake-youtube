import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../paths";

/**
 * 표현 사전 — 감정 하나에 그림 지시문 하나를 고정으로 붙여 둔다.
 * 컷마다 묘사를 새로 쓰면 (1) 사람이 매번 어렵고 (2) 그림체가 흔들린다.
 */

export const EXPRESSIONS_FILE = path.join(CONFIG_DIR, "toon-expressions.json");

export interface ToonExpression {
  key: string;
  label: string;
  prompt: string;
  /** 이 표정에 어울리는 연출 기호 (config/toon-overlays.json). 그림이 아니라 렌더러가 그린다 */
  overlay?: string;
}

export function loadExpressions(): ToonExpression[] {
  try {
    const raw = JSON.parse(fs.readFileSync(EXPRESSIONS_FILE, "utf8"));
    return Array.isArray(raw?.expressions) ? (raw.expressions as ToonExpression[]) : [];
  } catch {
    return [];
  }
}

export function findExpression(key: string): ToonExpression | undefined {
  return loadExpressions().find((e) => e.key === key);
}

/** 캐릭터 바이블 — 그림체를 고정하는 부분. 표정만 갈아끼운다. */
export const STYLE_LOCK = [
  "KEEP EXACTLY (this is the artist's own style, do not improve or polish it):",
  "- Oversized round head, about 60% of total body height",
  "- Single uniform thin black ink line, slightly wobbly, hand-drawn feel",
  "- Tiny dot eyes, small simple mouth, no nose",
  "- Minimal stick-like thin arms and legs",
  "- Completely flat: no shading, no gradient, no highlight, no line-weight variation",
  "- Flat off-white fill inside the outline",
  "- Simple oversized short-sleeve t-shirt in soft dusty blue, wide off-white pants",
  "- Short bob haircut with one small stray strand sticking up",
  "",
  "DO NOT:",
  "- No cheek blush, no eye sparkle, no decorations",
  "- No background (plain white)",
  "- No text, no letters",
  "- No floating comic symbols at all: no speech bubble, no sweat drop, no motion lines, no spiral.",
  "  (those are drawn separately by code - if you draw them the asset cannot be reused)",
].join("\n");

/** Gemini 앱에 그대로 붙여넣을 프롬프트를 만든다 (기준 캐릭터 이미지 첨부 전제). */
export function buildExpressionPrompt(e: ToonExpression): string {
  return [
    `Redraw the EXACT SAME character from my reference image, changing only the pose and expression to: ${e.label}.`,
    "",
    `POSE AND ACTION (draw exactly this, it is a physical action not a mood): ${e.prompt}`,
    "",
    STYLE_LOCK,
    "",
    "Output: single character, full body, facing viewer, centered, ~80% of frame, plain white background, square.",
  ].join("\n");
}
