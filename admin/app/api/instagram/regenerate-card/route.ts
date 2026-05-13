import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, PROJECTS_DIR } from "@/lib/paths";
import { generateImage, hasGeminiKey, base64ToBuffer } from "@/lib/geminiImage";
import { getCategory, type CategoryId } from "@/lib/instagram/categories";
import { renderCardPng } from "@/lib/instagram/overlay";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface RegenBody {
  slug: string;
  cardIndex: number;
  /** "background" → 배경만 다시, "all" → 배경+텍스트 다시 (텍스트는 같지만 새 배경) */
  mode: "background" | "all";
}

export async function POST(req: Request) {
  let body: RegenBody;
  try {
    body = (await req.json()) as RegenBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }
  if (!body.slug || !body.cardIndex || body.cardIndex < 1) {
    return NextResponse.json({ ok: false, error: "invalid_args" }, { status: 400 });
  }
  if (!hasGeminiKey()) {
    return NextResponse.json(
      { ok: false, error: "no_gemini_key", message: "GEMINI_API_KEY 가 없습니다." },
      { status: 400 }
    );
  }
  const outDir = path.join(PROJECTS_DIR, body.slug, "instagram-cards");
  const outputJsonPath = path.join(outDir, "output.json");
  if (!fs.existsSync(outputJsonPath)) {
    return NextResponse.json({ ok: false, error: "slug_not_found" }, { status: 404 });
  }
  const outputJson = JSON.parse(fs.readFileSync(outputJsonPath, "utf8"));
  const card = (outputJson.cards as any[]).find((c) => c.index === body.cardIndex);
  if (!card) {
    return NextResponse.json({ ok: false, error: "card_not_found" }, { status: 404 });
  }
  const cat = getCategory(outputJson.category as CategoryId);

  // 새 배경 프롬프트 생성 (살짝 변주 위해 timestamp + random seed 단어)
  const variations = ["soft", "minimal", "elegant", "calm", "fresh", "warm"];
  const v = variations[Math.floor(Math.random() * variations.length)];
  const prompt = `${cat.backgroundStyle}, ${v} composition variation`;

  let bgBuf: Buffer | null = null;
  try {
    const img = await generateImage({ prompt });
    bgBuf = base64ToBuffer(img.data);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "gemini_failed", message: (e as Error).message },
      { status: 500 }
    );
  }

  let png: Buffer;
  try {
    png = await renderCardPng({
      spec: {
        layout: card.layout,
        fields: card.fields,
        sources: card.sources,
        footer_source_label: card.footer_source_label,
      },
      category: cat,
      backgroundPng: bgBuf,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "render_failed", message: (e as Error).message },
      { status: 500 }
    );
  }

  const filename = `card-${String(body.cardIndex).padStart(2, "0")}.png`;
  fs.writeFileSync(path.join(outDir, "cards", filename), png);

  return NextResponse.json({
    ok: true,
    card: {
      index: body.cardIndex,
      layout: card.layout,
      file: path.relative(REPO_ROOT, path.join(outDir, "cards", filename)),
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      sources: card.sources ?? [],
    },
  });
}
