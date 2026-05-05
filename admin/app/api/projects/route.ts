import { NextResponse } from "next/server";
import { copyExampleProject, getProjectSummary, listProjectSlugs } from "@/lib/projects";
import { writeChannelConfigSnapshot, getProjectNiche } from "@/lib/niche";

export const dynamic = "force-dynamic";

export async function GET() {
  const slugs = listProjectSlugs();
  const projects = slugs.map((s) => ({
    ...getProjectSummary(s),
    niche: getProjectNiche(s),
  }));
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = String(body?.slug ?? "").trim();
  const nicheOverride = body?.niche ? String(body.niche) : undefined;
  if (!slug || !/^[a-z0-9][a-z0-9-_]{1,60}$/i.test(slug)) {
    return NextResponse.json({ ok: false, error: "슬러그는 영문/숫자/-/_ 만, 2~61자." }, { status: 400 });
  }
  const r = copyExampleProject(slug);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  const snap = writeChannelConfigSnapshot(slug, nicheOverride);
  return NextResponse.json({ ok: true, slug, niche: snap.niche });
}
