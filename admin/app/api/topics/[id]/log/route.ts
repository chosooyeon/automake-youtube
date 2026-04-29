import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { QUEUE_DIR } from "@/lib/topics";

export const dynamic = "force-dynamic";

/**
 * topics/queue/<id>.log.md tail 반환 (라이브 로그용)
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const tail = parseInt(url.searchParams.get("tail") || "8000", 10);
  const p = path.join(QUEUE_DIR, `${params.id}.log.md`);
  if (!fs.existsSync(p)) return NextResponse.json({ logs: "" });
  const c = fs.readFileSync(p, "utf8");
  return NextResponse.json({ logs: c.length > tail ? c.slice(-tail) : c });
}
