import "server-only";
import { sql } from "./db";
import { matchBuyer, rankMatches, type Criteria, type Deal, type MatchResult } from "./matching";

export type BuyerMatch = {
  criteria: Criteria; result: MatchResult;
  contact: { id: string; name: string; company: string | null; last_contacted_at: string | null; email: string | null; do_not_contact: boolean };
};

/** Scores every active buyer profile against a property (and optional deal). One row per buyer: their best profile. */
export async function buyerMatches(orgId: string, propertyId: string, opportunityId?: string | null): Promise<{ deal: Deal; matches: BuyerMatch[] }> {
  const [p] = await sql`select city, zip, units, property_type, asking_price, estimated_value from properties where id = ${propertyId} and org_id = ${orgId}`;
  const [o] = opportunityId ? await sql`select expected_price, asking_price, expected_close_date, buyer_contact_id from opportunities where id = ${opportunityId} and org_id = ${orgId}` : [];
  const price = o?.expected_price ?? o?.asking_price ?? p.asking_price ?? p.estimated_value ?? null;
  const price_source = o?.expected_price ? "expected price" : o?.asking_price ? "deal asking" : p.asking_price ? "asking price" : p.estimated_value ? "your estimated value" : null;
  const deal: Deal = {
    city: p.city, zip: p.zip, units: p.units, price: price === null ? null : Number(price), price_source,
    property_type: p.property_type ?? (p.units >= 5 ? "multifamily_5plus" : p.units >= 2 ? "multifamily_2_4" : null),
    expected_close_date: o?.expected_close_date ?? null,
  };
  const rows = await sql`
    select b.*, c.full_name, c.last_contacted_at, c.do_not_contact, co.name as company,
           (select email from contact_emails e where e.contact_id = c.id and not e.opted_out order by is_primary desc limit 1) as email
    from buyer_criteria b join contacts c on c.id = b.contact_id left join companies co on co.id = c.company_id
    where b.org_id = ${orgId} and b.is_active`;
  const scored = rows.map((r) => ({
    criteria: { ...r, target_markets: r.target_markets ?? [], property_types: r.property_types ?? [] } as unknown as Criteria,
    result: matchBuyer({ ...r, target_markets: r.target_markets ?? [], property_types: r.property_types ?? [],
      min_price: r.min_price === null ? null : Number(r.min_price), max_price: r.max_price === null ? null : Number(r.max_price),
      available_equity: r.available_equity === null ? null : Number(r.available_equity) } as unknown as Criteria, deal),
    contact: { id: r.contact_id, name: r.full_name, company: r.company, last_contacted_at: r.last_contacted_at, email: r.email, do_not_contact: r.do_not_contact },
  }));
  // best profile per buyer
  const best = new Map<string, BuyerMatch>();
  for (const m of rankMatches(scored)) if (!best.has(m.contact.id)) best.set(m.contact.id, m);
  return { deal, matches: rankMatches([...best.values()]).filter((m) => m.contact.id !== o?.buyer_contact_id) };
}
