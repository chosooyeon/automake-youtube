import { NextResponse } from "next/server";
import {
  emptyProject,
  listProjects,
  makeSlug,
  readProject,
  writeProject,
  type LengthType,
} from "@/lib/cinema";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, projects: listProjects() });
}

interface CreateBody {
  title: string;
  length_type?: LengthType;
  genre?: string;
  tone?: string;
  concept?: string;
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }
  const title = (body.title || "").trim();
  if (title.length < 1) {
    return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  }
  let slug = makeSlug(title);
  while (readProject(slug)) {
    slug = makeSlug(title) + "-" + Math.random().toString(36).slice(2, 4);
  }
  const project = emptyProject(slug);
  project.title = title;
  if (body.length_type) project.length_type = body.length_type;
  if (body.genre) project.genre = body.genre;
  if (body.tone) project.tone = body.tone;
  if (body.concept) project.concept = body.concept;
  writeProject(project);
  return NextResponse.json({ ok: true, project });
}
