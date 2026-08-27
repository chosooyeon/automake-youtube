import { NextResponse } from "next/server";
import { loadExpressions, buildExpressionPrompt } from "@/lib/toon/expressions";

export const dynamic = "force-dynamic";

export async function GET() {
  const expressions = loadExpressions().map((e) => ({
    ...e,
    fullPrompt: buildExpressionPrompt(e),
  }));
  return NextResponse.json({ ok: true, expressions });
}
