/**
 * Gemini 2.5 Flash Image (별칭: nano-banana) 호출 헬퍼.
 * REST 직호출로 SDK 의존성 X.
 *
 * 환경변수: GEMINI_API_KEY  (https://aistudio.google.com/apikey)
 *
 * 문서: https://ai.google.dev/gemini-api/docs/image-generation
 */

const MODEL_ID = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

export interface GeminiImageInput {
  /** 이미지 생성 지시 텍스트 */
  prompt: string;
  /** 참조 이미지 (base64 + mime). 캐릭터 일관성 위해 1~5장 권장 */
  references?: { mimeType: string; data: string }[];
}

export interface GeminiImageOutput {
  /** 생성된 PNG/이미지의 base64 */
  data: string;
  mimeType: string;
}

export class GeminiImageError extends Error {
  status?: number;
  detail?: unknown;
  constructor(message: string, opts?: { status?: number; detail?: unknown }) {
    super(message);
    this.status = opts?.status;
    this.detail = opts?.detail;
  }
}

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function generateImage(input: GeminiImageInput): Promise<GeminiImageOutput> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiImageError(
      "GEMINI_API_KEY 환경변수가 없습니다. admin/.env.local 에 GEMINI_API_KEY=... 추가하세요. (https://aistudio.google.com/apikey)"
    );
  }

  const parts: any[] = [{ text: input.prompt }];
  if (input.references && input.references.length > 0) {
    for (const ref of input.references) {
      parts.push({
        inline_data: { mime_type: ref.mimeType, data: ref.data },
      });
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      // Gemini 2.5 Flash Image 는 응답에 IMAGE 모달리티가 포함되어야 함
      responseModalities: ["IMAGE"],
    },
  };

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw new GeminiImageError(`Gemini API ${res.status}`, { status: res.status, detail });
  }

  const json = (await res.json()) as any;
  // candidates[0].content.parts[].inline_data.data
  const candidates = json?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new GeminiImageError("Gemini 응답에 candidates 가 없습니다.", { detail: json });
  }
  const partsOut = candidates[0]?.content?.parts;
  if (!Array.isArray(partsOut)) {
    throw new GeminiImageError("Gemini 응답에 parts 가 없습니다.", { detail: json });
  }
  for (const p of partsOut) {
    const inline = p?.inline_data ?? p?.inlineData;
    if (inline?.data) {
      return {
        data: String(inline.data),
        mimeType: String(inline.mime_type ?? inline.mimeType ?? "image/png"),
      };
    }
  }
  // safety / 텍스트만 돌아온 경우
  const blockReason = json?.promptFeedback?.blockReason;
  throw new GeminiImageError(
    blockReason
      ? `Gemini 응답이 차단됨: ${blockReason}`
      : "Gemini 응답에 이미지가 포함되지 않았습니다.",
    { detail: json }
  );
}

export function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

export function bufferToBase64(buf: Buffer): string {
  return buf.toString("base64");
}
