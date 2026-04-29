import { NextResponse } from "next/server";
import { copyExampleProject, getProjectSummary, listProjectSlugs } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const slugs = listProjectSlugs();
  const projects = slugs.map((s) => getProjectSummary(s));
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = String(body?.slug ?? "").trim();
  if (!slug || !/^[a-z0-9][a-z0-9-_]{1,60}$/i.test(slug)) {
    return NextResponse.json({ ok: false, error: "슬러그는 영문/숫자/-/_ 만, 2~61자." }, { status: 400 });
  }
  const r = copyExampleProject(slug);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true, slug });
}
