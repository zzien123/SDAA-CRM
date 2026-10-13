import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const s = await requireSession();
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind");
  const words = (u.searchParams.get("q") ?? "").toLowerCase().slice(0, 80).split(/\s+/).filter(Boolean);
  if (!words.length) return NextResponse.json({ items: [] });
  const pats = words.map((w) => `%${w}%`);
  let items: { id: string; label: string; sub?: string }[] = [];
  if (kind === "contact") {
    items = (await sql`select c.id, c.full_name, co.name as company from contacts c left join companies co on co.id = c.company_id
                       where c.org_id = ${s.orgId} and c.search_text ilike all(${pats}) order by c.last_contacted_at desc nulls last limit 10`)
      .map((r) => ({ id: r.id, label: r.full_name, sub: r.company ?? undefined }));
  } else if (kind === "entity") {
    items = (await sql`select id, name, mailing_city from entities where org_id = ${s.orgId} and search_text ilike all(${pats}) limit 10`)
      .map((r) => ({ id: r.id, label: r.name, sub: r.mailing_city ?? undefined }));
  } else if (kind === "property") {
    items = (await sql`select id, street_address, city, units from properties where org_id = ${s.orgId} and search_text ilike all(${pats}) order by units desc nulls last limit 10`)
      .map((r) => ({ id: r.id, label: r.street_address, sub: [r.city, r.units ? `${r.units} units` : null].filter(Boolean).join(" · ") }));
  }
  return NextResponse.json({ items });
}
