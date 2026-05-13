import { NextResponse } from "next/server";
import { hasGeminiKey } from "@/lib/geminiImage";
import { loadProject } from "@/lib/emoticonStore";
import { generateOneExpression } from "@/lib/emoticonGenerate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  projectId: string;
  /** 1-based index of expression in meta.expressions */
  index: number;
}

export async function POST(req: Request) {
  if (!hasGeminiKey()) {
    return NextResponse.json(
      { ok: false, error: "no_gemini_key", message: "GEMINI_API_KEY 가 없습니다." },
      { status: 400 }
    );
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const meta = loadProject(body.projectId);
  if (!meta) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const expr = meta.expressions.find((e) => e.index === body.index);
  if (!expr) {
    return NextResponse.json({ ok: false, error: "expression_not_found" }, { status: 400 });
  }
  const res = await generateOneExpression(meta, expr);
  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: res.rateLimited ? "rate_limited" : "gemini_failed",
        status: res.status,
        message: res.message,
        detail: res.detail,
      },
      { status: res.rateLimited ? 429 : 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    generated: res.record,
    url: `/api/emoticon/image/${meta.id}/output/${res.filename}`,
  });
}
