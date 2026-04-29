import { NextResponse } from "next/server";
import { listArchive, listQueue } from "@/lib/topics";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    queue: listQueue(),
    archive: listArchive(),
  });
}
