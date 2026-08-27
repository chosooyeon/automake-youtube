import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../paths";

/**
 * 소품 사전 — 캐릭터와 같은 그림체의 오브젝트.
 * 표정 에셋과 같은 이유로 한 번 만들어 재사용한다 (비용 0원 + 편마다 톤이 안 흔들림).
 */

export const PROPS_FILE = path.join(CONFIG_DIR, "toon-props.json");

export interface ToonProp {
  key: string;
  label: string;
  prompt: string;
}

export function loadProps(): ToonProp[] {
  try {
    const raw = JSON.parse(fs.readFileSync(PROPS_FILE, "utf8"));
    return Array.isArray(raw?.props) ? (raw.props as ToonProp[]) : [];
  } catch {
    return [];
  }
}

/**
 * 캐릭터용 STYLE_LOCK 과 조항이 다르다: 머리 비율·헤어스타일 같은 인물 조항을 빼고,
 * 대신 "사람을 그리지 마라"를 넣는다. 이게 없으면 소품 옆에 캐릭터를 같이 그려버린다.
 */
export const PROP_STYLE_LOCK = [
  "KEEP EXACTLY (must match my character illustration style):",
  "- Single uniform thin black ink line, slightly wobbly, hand-drawn feel",
  "- Completely flat: no shading, no gradient, no highlight, no line-weight variation",
  "- Flat off-white fill, with at most ONE muted dusty blue accent",
  "- Simple and rounded, drawn as a quick doodle - not detailed, not realistic",
  "",
  "DO NOT:",
  "- No people, no characters, no hands",
  "- No background (plain white)",
  "- No text, no letters, no numbers",
  "- No perspective, no 3D, no drop shadow",
].join("\n");

export function buildPropPrompt(p: ToonProp): string {
  return [
    `Draw ONE object in the exact same hand-drawn doodle style as my reference image: ${p.prompt}.`,
    "",
    PROP_STYLE_LOCK,
    "",
    "Output: the single object only, centered, ~70% of frame, plain white background, square.",
  ].join("\n");
}
