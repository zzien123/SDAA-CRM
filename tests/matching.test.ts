import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBuyer, rankMatches, type Criteria, type Deal } from "../src/lib/matching";

const base: Criteria = {
  id: "c", contact_id: "p", label: "x", target_markets: [], property_types: [], min_units: null, max_units: null, min_price: null, max_price: null,
  available_equity: null, strategy: null, financing_preference: null, seller_financing_interest: null, is_1031: null,
  exchange_id_deadline: null, exchange_close_deadline: null, timeline: null, last_confirmed_at: null,
};
const deal: Deal = { city: "Oceanside", zip: "92054", units: 24, price: 6_000_000, price_source: "asking", property_type: "multifamily_5plus" };

test("unknown preferences never count as a match", () => {
  const r = matchBuyer(base, deal);
  assert.equal(r.score, 0);
  assert.equal(r.conflicts.length, 0);
  assert.ok(r.unknowns.includes("target markets") && r.unknowns.includes("price range") && r.unknowns.includes("unit range"));
  assert.equal(r.tier, "weak");
});

test("full fit is strong with reasons", () => {
  const r = matchBuyer({ ...base, target_markets: ["Oceanside", "Carlsbad"], min_units: 10, max_units: 40, min_price: 3e6, max_price: 8e6,
    property_types: ["multifamily_5plus"], available_equity: 2.5e6 }, deal);
  assert.equal(r.tier, "strong");
  assert.equal(r.score, 95);
  assert.equal(r.matches.length, 5);
});

test("known mismatch is a conflict and ranks last", () => {
  const good = { result: matchBuyer({ ...base, target_markets: ["92054"] }, deal) };
  const bad = { result: matchBuyer({ ...base, target_markets: ["Oceanside"], max_units: 10, min_price: 1e6, max_price: 9e6 }, deal) };
  assert.equal(bad.result.tier, "conflict");
  assert.ok(bad.result.conflicts[0].includes("24 units"));
  assert.deepEqual(rankMatches([bad, good]).map((x) => x.result.tier), ["possible", "conflict"]);
});

test("price slightly over max is a note, not a conflict", () => {
  const r = matchBuyer({ ...base, max_price: 5.6e6 }, deal);
  assert.equal(r.conflicts.length, 0);
  assert.ok(r.notes.some((n) => n.includes("over their max")));
});

test("1031 urgency and deadline conflict", () => {
  const today = "2026-10-13";
  const r = matchBuyer({ ...base, is_1031: true, exchange_id_deadline: "2026-11-07", exchange_close_deadline: "2027-03-01" }, { ...deal, expected_close_date: "2027-04-15" }, today);
  assert.ok(r.matches.some((m) => m.includes("25 days left")));
  assert.ok(r.conflicts.some((c) => c.includes("180-day")));
});
