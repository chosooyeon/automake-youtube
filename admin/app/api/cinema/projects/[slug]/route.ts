import { NextResponse } from "next/server";
import { deleteProject, readProject, writeProject, type CinemaProject } from "@/lib/cinema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const project = readProject(ctx.params.slug);
  if (!project) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, project });
}

export async function PUT(req: Request, ctx: { params: { slug: string } }) {
  let body: CinemaProject;
  try {
    body = (await req.json()) as CinemaProject;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }
  if (!body || body.slug !== ctx.params.slug) {
    return NextResponse.json({ ok: false, error: "slug_mismatch" }, { status: 400 });
  }
  const existing = readProject(ctx.params.slug);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const merged: CinemaProject = { ...existing, ...body, created_at: existing.created_at };
  writeProject(merged);
  return NextResponse.json({ ok: true, project: merged });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string } }) {
  const ok = deleteProject(ctx.params.slug);
  if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
