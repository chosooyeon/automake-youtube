import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { QUEUE_DIR } from "@/lib/topics";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const f = path.join(QUEUE_DIR, `${params.id}.json`);
  const md = path.join(QUEUE_DIR, `${params.id}.md`);
  const log = path.join(QUEUE_DIR, `${params.id}.log.md`);
  let removed = 0;
  for (const p of [f, md, log]) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removed++;
    }
  }
  return NextResponse.json({ ok: true, removed });
}
