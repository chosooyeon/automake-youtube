import { NextResponse } from "next/server";
import { getProjectSummary } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  try {
    const summary = getProjectSummary(params.slug);
    return NextResponse.json(summary);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 404 });
  }
}
