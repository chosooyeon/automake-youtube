import fs from "node:fs";
import path from "node:path";
import { generateImage, bufferToBase64, GeminiImageError } from "./geminiImage";
import { MARKETS } from "./emoticonMarkets";
import {
  type EmoticonMeta,
  type EmoticonExpression,
  type EmoticonGenerated,
  projectDir,
  saveOutputImage,
  saveProject,
} from "./emoticonStore";

export function loadReferencesAsParts(meta: { id: string; references: string[] }) {
  const out: { mimeType: string; data: string }[] = [];
  const refDir = path.join(projectDir(meta.id), "reference");
  for (const name of meta.references) {
    try {
      const buf = fs.readFileSync(path.join(refDir, name));
      const ext = name.toLowerCase().split(".").pop() || "png";
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
          ? "image/webp"
          : "image/png";
      out.push({ mimeType: mime, data: bufferToBase64(buf) });
    } catch {}
  }
  return out;
}

export function buildExpressionPrompt(meta: EmoticonMeta, expr: EmoticonExpression): string {
  const spec = MARKETS[meta.market];
  return [
    "Generate one variant of the EXACT SAME character shown in the reference images.",
    "Keep the character's body proportions, colors, outline thickness, and overall style strictly consistent.",
    "",
    `[Character context] ${meta.concept}`,
    "",
    "[This sticker's expression / situation]",
    `${expr.label} — ${expr.prompt}`,
    "",
    "[Output requirements]",
    "- Single character. Fully transparent background (alpha).",
    `- ${spec.outputSize.width}×${spec.outputSize.height} aspect, character centered, ~80% of frame.`,
    "- Flat colors, thick outline (2~3 px) — match the reference.",
    `- No text/letters on the image (the label '${expr.label}' is added separately).`,
    "- No watermark, no logo, no background scenery.",
    "- PNG only.",
  ].join("\n");
}

export interface GenerateOneResult {
  ok: true;
  record: EmoticonGenerated;
  filename: string;
}
export interface GenerateOneError {
  ok: false;
  rateLimited: boolean;
  status?: number;
  message: string;
  detail?: unknown;
}

/**
 * 표현 1개 생성 → 파일 저장 → meta 업데이트.
 * 호출자가 meta 를 미리 load 해서 줘야 함. 저장은 내부에서 함.
 */
export async function generateOneExpression(
  meta: EmoticonMeta,
  expr: EmoticonExpression
): Promise<GenerateOneResult | GenerateOneError> {
  if (meta.references.length === 0) {
    return {
      ok: false,
      rateLimited: false,
      message: "참조 이미지가 없음 (시안 채택 또는 업로드 필요).",
    };
  }
  const prompt = buildExpressionPrompt(meta, expr);
  const references = loadReferencesAsParts(meta);
  try {
    const img = await generateImage({ prompt, references });
    const buf = Buffer.from(img.data, "base64");
    const filename = saveOutputImage(meta.id, expr.index, expr.label, buf);
    const record: EmoticonGenerated = {
      index: expr.index,
      expression: expr.label,
      file: filename,
      createdAt: new Date().toISOString(),
    };
    const existing = meta.generated.findIndex((g) => g.index === expr.index);
    if (existing >= 0) meta.generated[existing] = record;
    else meta.generated.push(record);
    saveProject(meta);
    return { ok: true, record, filename };
  } catch (e) {
    const err = e as GeminiImageError;
    const rateLimited = err.status === 429;
    return {
      ok: false,
      rateLimited,
      status: err.status,
      message: err.message,
      detail: err.detail,
    };
  }
}

/** exponential backoff. 429 받았을 때만 호출. */
export function backoffDelayMs(attempt: number): number {
  // 5s, 12s, 25s, 40s, 60s (max)
  const ladder = [5_000, 12_000, 25_000, 40_000, 60_000];
  return ladder[Math.min(attempt, ladder.length - 1)];
}
