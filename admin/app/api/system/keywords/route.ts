import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

const GLOBAL = path.join(CONFIG_DIR, "global.json");

export async function GET() {
  const j = JSON.parse(fs.readFileSync(GLOBAL, "utf8"));
  return NextResponse.json({ keywords: j?.apis?.search?.youtube_research_queries ?? [] });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const keywords = Array.isArray(body?.keywords)
    ? body.keywords.map((s: unknown) => String(s)).filter((s: string) => s.trim().length > 0)
    : null;
  if (!keywords) return NextResponse.json({ ok: false, error: "keywords (string[]) 필요" }, { status: 400 });
  const j = JSON.parse(fs.readFileSync(GLOBAL, "utf8"));
  j.apis = j.apis ?? {};
  j.apis.search = j.apis.search ?? {};
  j.apis.search.youtube_research_queries = keywords;
  fs.writeFileSync(GLOBAL, JSON.stringify(j, null, 2));
  return NextResponse.json({ ok: true, keywords });
}
