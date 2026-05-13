import { NextResponse } from "next/server";
import { generateImage, GeminiImageError, hasGeminiKey } from "@/lib/geminiImage";
import { MARKETS, isValidMarket } from "@/lib/emoticonMarkets";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  market: string;
  concept: string;
}

export async function POST(req: Request) {
  if (!hasGeminiKey()) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_gemini_key",
        message:
          "GEMINI_API_KEY 가 설정되지 않았습니다. admin/.env.local 에 추가 후 dev 서버 재시작.",
      },
      { status: 400 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isValidMarket(body.market)) {
    return NextResponse.json({ ok: false, error: "invalid_market" }, { status: 400 });
  }
  if (!body.concept || body.concept.trim().length < 5) {
    return NextResponse.json(
      { ok: false, error: "concept_too_short", message: "캐릭터 컨셉을 5자 이상 입력하세요." },
      { status: 400 }
    );
  }

  const spec = MARKETS[body.market];
  const prompt = [
    "Create a single character design for a sticker/emoticon set.",
    "",
    `[Character concept] ${body.concept.trim()}`,
    "",
    "[Pose for this first reference]",
    "Standing front-facing, neutral friendly expression, both hands visible. This image will be used as the canonical reference for generating 24~40 expression variants later, so the character must be clear and centered.",
    "",
    "[Required style]",
    "- Clean cartoon/illustration style (no photoreal)",
    "- Flat colors with simple shading. Thick outline (2~3 px).",
    "- Fully transparent background (alpha channel).",
    `- Output as PNG, roughly ${spec.outputSize.width}×${spec.outputSize.height} aspect.`,
    "- Character occupies ~80% of the frame, centered.",
    "- No text, no watermark, no logo.",
  ].join("\n");

  try {
    const img = await generateImage({ prompt });
    return NextResponse.json({
      ok: true,
      image_base64: img.data,
      mime_type: img.mimeType,
    });
  } catch (e) {
    const err = e as GeminiImageError;
    return NextResponse.json(
      {
        ok: false,
        error: "gemini_failed",
        message: err.message,
        status: err.status,
        detail: err.detail,
      },
      { status: 500 }
    );
  }
}
