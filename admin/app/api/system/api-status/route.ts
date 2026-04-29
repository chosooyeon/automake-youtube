import { NextResponse } from "next/server";
import { checkAll } from "@/lib/apiHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await checkAll();
  return NextResponse.json({ items });
}
