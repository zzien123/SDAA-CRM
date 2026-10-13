import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchAll } from "@/lib/search";

export async function GET(req: Request) {
  const s = await requireSession();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 8), 50);
  return NextResponse.json({ hits: (await searchAll(s.orgId, q, limit)).slice(0, limit) });
}
