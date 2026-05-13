import { NextResponse } from "next/server";
import {
  createProject,
  listProjects,
  loadProject,
  saveProject,
  saveReferenceImage,
} from "@/lib/emoticonStore";
import { isValidMarket } from "@/lib/emoticonMarkets";

export const dynamic = "force-dynamic";

/** GET — 프로젝트 목록 */
export async function GET() {
  const items = listProjects();
  return NextResponse.json({ ok: true, items });
}

/** POST — 프로젝트 생성 (캐릭터 정의 단계) */
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  let market = "";
  let concept = "";
  let expressions: any[] | undefined;
  let referencesBuffers: { name: string; buf: Buffer; type: string }[] = [];

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    market = String(form.get("market") || "");
    concept = String(form.get("concept") || "");
    const ex = form.get("expressions");
    if (typeof ex === "string" && ex.length > 0) {
      try {
        expressions = JSON.parse(ex);
      } catch {}
    }
    const files = form.getAll("references");
    for (const f of files) {
      if (f instanceof File) {
        const buf = Buffer.from(await f.arrayBuffer());
        const name = (f.name || "ref.png").replace(/[\\/:*?"<>|]+/g, "_");
        referencesBuffers.push({ name, buf, type: f.type || "image/png" });
      }
    }
  } else {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    market = String(body.market || "");
    concept = String(body.concept || "");
    expressions = Array.isArray(body.expressions) ? body.expressions : undefined;
  }

  if (!isValidMarket(market)) {
    return NextResponse.json({ ok: false, error: "invalid_market" }, { status: 400 });
  }
  if (!concept || concept.trim().length < 5) {
    return NextResponse.json(
      { ok: false, error: "concept_too_short", message: "캐릭터 컨셉을 5자 이상 입력하세요." },
      { status: 400 }
    );
  }

  const meta = createProject({ market, concept: concept.trim() });
  if (expressions && expressions.length > 0) {
    meta.expressions = expressions.map((e: any, i: number) => ({
      index: Number(e.index ?? i + 1),
      label: String(e.label ?? ""),
      prompt: String(e.prompt ?? ""),
    }));
  }
  for (let i = 0; i < referencesBuffers.length; i++) {
    const r = referencesBuffers[i];
    const ext =
      r.type.includes("png") ? "png" :
      r.type.includes("jpeg") || r.type.includes("jpg") ? "jpg" :
      r.type.includes("webp") ? "webp" : "png";
    const filename = `upload-${String(i).padStart(2, "0")}.${ext}`;
    saveReferenceImage(meta.id, filename, r.buf);
    meta.references.push(filename);
  }
  saveProject(meta);
  return NextResponse.json({ ok: true, project: meta });
}

/** PUT — 프로젝트 갱신 (표현 리스트 / reference 추가 등) */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !body.id) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const meta = loadProject(body.id);
  if (!meta) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (Array.isArray(body.expressions)) {
    meta.expressions = body.expressions.map((e: any, i: number) => ({
      index: Number(e.index ?? i + 1),
      label: String(e.label ?? ""),
      prompt: String(e.prompt ?? ""),
    }));
  }
  if (typeof body.concept === "string") meta.concept = body.concept;
  saveProject(meta);
  return NextResponse.json({ ok: true, project: meta });
}
