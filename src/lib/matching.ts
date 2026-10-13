// Buyer ↔ property matching. Pure functions; unit-tested in tests/matching.test.ts.
// Rules: only KNOWN preferences can score a match; unknowns are listed, never counted.
// A known preference the deal violates is a conflict, and conflicted buyers rank below clean ones.

export type Criteria = {
  id: string; contact_id: string; label: string;
  target_markets: string[]; property_types: string[];
  min_units: number | null; max_units: number | null;
  min_price: number | null; max_price: number | null;
  available_equity: number | null;
  strategy: string | null; financing_preference: string | null; seller_financing_interest: boolean | null;
  is_1031: boolean | null; exchange_id_deadline: string | null; exchange_close_deadline: string | null;
  timeline: string | null; last_confirmed_at: string | null;
};

export type Deal = {
  city: string | null; zip: string | null; neighborhood?: string | null;
  units: number | null; price: number | null; price_source: string | null;
  property_type: string | null; seller_financing_available?: boolean | null;
  expected_close_date?: string | null;
};

export type MatchResult = {
  score: number;          // 0–100 from matched factors only
  known: number;          // weight of factors where both sides are known
  matches: string[]; conflicts: string[]; unknowns: string[]; notes: string[];
  tier: "strong" | "possible" | "weak" | "conflict";
};

const W = { market: 30, price: 25, units: 20, type: 10, equity: 10, exchange: 5 };
const EQUITY_SHARE = 0.35; // assumption: ~35% down on agency/bank debt; shown to the user as an assumption

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1e3)}K`);

export function matchBuyer(c: Criteria, d: Deal, today = new Date().toISOString().slice(0, 10)): MatchResult {
  const r: MatchResult = { score: 0, known: 0, matches: [], conflicts: [], unknowns: [], notes: [], tier: "weak" };

  // Market: city, zip or neighborhood named in the buyer's markets
  if (!c.target_markets.length) r.unknowns.push("target markets");
  else if (!d.city && !d.zip) r.unknowns.push("property location");
  else {
    r.known += W.market;
    const places = [d.city, d.zip, d.neighborhood].filter(Boolean).map((x) => norm(String(x)));
    const hit = c.target_markets.find((m) => { const n = norm(m); return places.some((p) => p === n || (n.length >= 4 && p.includes(n)) || (p.length >= 4 && n.includes(p))); });
    const county = c.target_markets.some((m) => /sandiegocounty|allofsandiego|countywide/.test(norm(m)));
    if (hit || county) { r.score += W.market; r.matches.push(`Market: ${hit ?? "San Diego County"}`); }
    else r.conflicts.push(`Location ${d.city ?? d.zip} isn't in their markets (${c.target_markets.join(", ")})`);
  }

  // Price
  if (c.min_price === null && c.max_price === null) r.unknowns.push("price range");
  else if (d.price === null) r.unknowns.push("deal price");
  else {
    r.known += W.price;
    const lo = c.min_price ?? 0, hi = c.max_price ?? Infinity;
    if (d.price >= lo && d.price <= hi) { r.score += W.price; r.matches.push(`Price ${money(d.price)} within ${c.min_price ? money(c.min_price) : "$0"}–${c.max_price ? money(c.max_price) : "no max"}`); }
    else if (d.price > hi && d.price <= hi * 1.1) { r.score += W.price / 2; r.notes.push(`Price ${money(d.price)} is ${Math.round((d.price / hi - 1) * 100)}% over their max ${money(hi)}`); }
    else r.conflicts.push(`Price ${money(d.price)} outside ${c.min_price ? money(c.min_price) : "$0"}–${c.max_price ? money(c.max_price) : "no max"}`);
  }

  // Units
  if (c.min_units === null && c.max_units === null) r.unknowns.push("unit range");
  else if (d.units === null) r.unknowns.push("unit count");
  else {
    r.known += W.units;
    const lo = c.min_units ?? 0, hi = c.max_units ?? Infinity;
    if (d.units >= lo && d.units <= hi) { r.score += W.units; r.matches.push(`${d.units} units within ${c.min_units ?? 0}–${c.max_units ?? "any"}`); }
    else r.conflicts.push(`${d.units} units outside ${c.min_units ?? 0}–${c.max_units ?? "any"}`);
  }

  // Property type
  if (!c.property_types.length) r.unknowns.push("property type");
  else if (!d.property_type) r.unknowns.push("deal property type");
  else {
    r.known += W.type;
    const t = norm(d.property_type);
    const ok = c.property_types.some((x) => { const n = norm(x); return n === t || t.startsWith(n) || n.startsWith(t) || (n.includes("multifamily") && t.includes("multifamily")); });
    if (ok) { r.score += W.type; r.matches.push(`Type: ${d.property_type.replace(/_/g, " ")}`); }
    else r.conflicts.push(`Type ${d.property_type.replace(/_/g, " ")} not in ${c.property_types.join(", ")}`);
  }

  // Equity capacity (assumption-labeled)
  if (c.available_equity === null) r.unknowns.push("available equity");
  else if (d.price !== null) {
    r.known += W.equity;
    const need = d.price * EQUITY_SHARE;
    if (c.available_equity >= need) { r.score += W.equity; r.matches.push(`Equity ${money(c.available_equity)} covers ~${Math.round(EQUITY_SHARE * 100)}% down (${money(need)})`); }
    else if (c.seller_financing_interest && d.seller_financing_available) { r.score += W.equity / 2; r.notes.push("Equity short of a conventional down payment; seller financing could bridge it"); }
    else r.notes.push(`Equity ${money(c.available_equity)} is below ~${Math.round(EQUITY_SHARE * 100)}% down (${money(need)}) — assumption, confirm their leverage`);
  }

  // 1031 timing: an active exchange is a motivation signal, and a deadline risk
  if (c.is_1031 === true) {
    if (c.exchange_id_deadline && c.exchange_id_deadline >= today) {
      r.known += W.exchange; r.score += W.exchange;
      const days = Math.round((new Date(c.exchange_id_deadline + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 86400000);
      r.matches.push(`Active 1031: ${days} days left to identify`);
      if (d.expected_close_date && c.exchange_close_deadline && d.expected_close_date > c.exchange_close_deadline) r.conflicts.push(`Expected close is after their 180-day deadline (${c.exchange_close_deadline})`);
    } else if (c.exchange_id_deadline && c.exchange_id_deadline < today) r.notes.push("1031 identification window has passed — confirm status");
    else r.notes.push("In a 1031; deadlines not recorded");
  }

  if (c.strategy) r.notes.push(`Strategy: ${c.strategy.replace(/_/g, " ")} (check against the deal's story)`);
  if (!c.last_confirmed_at) r.notes.push("Criteria never confirmed with the buyer");
  else if (c.last_confirmed_at < new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)) r.notes.push(`Criteria last confirmed ${c.last_confirmed_at} — may be stale`);

  // Normalize to 0–100 over the factors that are known on both sides
  const max = Object.values(W).reduce((a, b) => a + b, 0);
  r.score = Math.round((r.score / max) * 100);
  r.tier = r.conflicts.length ? "conflict" : r.score >= 60 ? "strong" : r.score >= 30 ? "possible" : "weak";
  return r;
}

const TIER_RANK = { strong: 0, possible: 1, weak: 2, conflict: 3 };
export function rankMatches<T extends { result: MatchResult }>(list: T[]): T[] {
  return [...list].sort((a, b) => TIER_RANK[a.result.tier] - TIER_RANK[b.result.tier] || b.result.score - a.result.score || a.result.conflicts.length - b.result.conflicts.length);
}
