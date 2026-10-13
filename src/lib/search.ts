import { sql } from "./db";

export type Hit = { kind: "property" | "owner" | "contact" | "company" | "deal"; id: string; title: string; sub: string | null; href: string };

/** Universal search. Every word must match; digits-only queries also match phones and APNs. */
export async function searchAll(orgId: string, q: string, limit = 8): Promise<Hit[]> {
  const words = q.toLowerCase().replace(/[^\w\s-]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return [];
  const pats = words.map((w) => `%${w}%`);
  const digits = q.replace(/\D/g, "");
  const digitPat = digits.length >= 4 ? `%${digits}%` : null;

  const [props, owners, contacts, companies, deals] = await Promise.all([
    sql`select p.id, p.street_address, p.city, p.units,
               (select string_agg(apn, ', ') from parcels where property_id = p.id) as apns
        from properties p
        where p.org_id = ${orgId} and (p.search_text ilike all(${pats})
          or (${digitPat}::text is not null and exists (select 1 from parcels pc where pc.property_id = p.id and regexp_replace(pc.apn,'\\D','','g') like ${digitPat})))
        order by (p.search_text ilike ${words[0] + "%"}) desc, p.units desc nulls last limit ${limit}`,
    sql`select e.id, e.name, e.entity_type, (select count(*) from property_ownerships po where po.entity_id = e.id and po.is_current)::int as n
        from entities e where e.org_id = ${orgId} and e.search_text ilike all(${pats})
        order by n desc limit ${limit}`,
    sql`select c.id, c.full_name, c.title, co.name as company
        from contacts c left join companies co on co.id = c.company_id
        where c.org_id = ${orgId} and (c.search_text ilike all(${pats})
          or (${digitPat}::text is not null and exists (select 1 from contact_phones cp where cp.contact_id = c.id and cp.phone_digits like ${digitPat}))
          or exists (select 1 from contact_emails ce where ce.contact_id = c.id and lower(ce.email) like ${"%" + q.toLowerCase().trim() + "%"}))
        order by c.last_contacted_at desc nulls last limit ${limit}`,
    sql`select id, name, company_type from companies where org_id = ${orgId} and search_text ilike all(${pats}) limit ${limit}`,
    sql`select o.id, o.name, s.name as stage from opportunities o join pipeline_stages s on s.id = o.stage_id
        where o.org_id = ${orgId} and o.search_text ilike all(${pats}) order by o.updated_at desc limit ${limit}`,
  ]);

  const hits: Hit[] = [
    ...deals.map((d) => ({ kind: "deal" as const, id: d.id, title: d.name, sub: d.stage, href: `/opportunities/${d.id}` })),
    ...contacts.map((c) => ({ kind: "contact" as const, id: c.id, title: c.full_name, sub: [c.title, c.company].filter(Boolean).join(" · ") || null, href: `/contacts/${c.id}` })),
    ...props.map((p) => ({ kind: "property" as const, id: p.id, title: p.street_address, sub: [p.city, p.units ? `${p.units} units` : null, p.apns].filter(Boolean).join(" · "), href: `/properties/${p.id}` })),
    ...owners.map((o) => ({ kind: "owner" as const, id: o.id, title: o.name, sub: `${o.n} propert${o.n === 1 ? "y" : "ies"}`, href: `/owners/${o.id}` })),
    ...companies.map((c) => ({ kind: "company" as const, id: c.id, title: c.name, sub: c.company_type, href: `/contacts?company=${c.id}` })),
  ];
  return hits.slice(0, limit * 3);
}
