# Architecture

## Data model (db/migrations/0001–0003)

```
organizations ─┬─ memberships ── users            (team-ready: admin / broker / agent / analyst / TC roles)
               │
properties ────┼─ parcels (1..n APNs)             portfolios ── portfolio_properties
   │           │
   ├── property_ownerships ── entities ── entity_people ── contacts ─┬─ contact_categories (multi)
   │     (vesting role, %, start/end,      (role, %, decision-maker,  ├─ contact_phones (DNC)
   │      source, confidence, history)      source, confidence)       ├─ contact_emails (opt-out)
   │                                                                  ├─ buyer_criteria (1..n profiles)
   ├── property_contacts (PM, owner rep, on-site…) ───────────────────┘   companies
   ├── opportunities ── pipeline_stages (custom, per org)
   ├── activities (unified timeline: property / entity / contact / deal)
   ├── tasks (typed, recurring)
   └── documents (Supabase Storage paths, versioned)

prospect_lists ── prospect_list_items (per property; queue groups by owner)   suppressions (phone / email / mailing)
imports ── import_records (row-level provenance → rollback) · import_rejections · ownership_reviews
audit_log
```

Design rules baked into the schema:
- **Owner of record ≠ decision maker.** `entities` hold title; people attach through `entity_people` with role, evidence and confidence.
  A beneficial-owner link can't be saved as *unverified*.
- **Ownership is historical.** Changes close the current `property_ownerships` row with an `end_date`. Nothing is deleted.
- **Provenance everywhere.** Imported rows carry `source_import_id`. Ownership and people links carry `source`, `confidence`, `verified_at`.
- **Unknown ≠ no.** Buyer preferences like seller financing and 1031 are tri-state. Blank ranges never match a "fits" filter.
- **`property_overview` view** joins each property to its primary current owner and computes tenure, absentee and out-of-state flags,
  and last outreach. Lists, filters, exports and the dashboard all read from it.

## Application structure

```
src/app/(app)/            authenticated pages (server components query Postgres directly)
src/app/(app)/actions.ts  all mutations (server actions): zod validation, org-ownership checks, audit log
src/app/api/              search, lookup (typeahead), import preview/run, CSV export
src/lib/importer/         parse (ExcelJS/PapaParse) → map → normalize → dedupe → write; contacts importer; rollback
src/lib/normalize.ts      APN / address / name / phone / date normalization + owner-type classifier (unit-tested)
src/lib/queries.ts        timelines, tasks, relationship strength, commission SQL
```

Modules plug in at the data layer: underwriting writes `current_noi` / `stabilized_noi` / `estimated_value` back to `properties`.
Transaction management will hang off `opportunities` (the stage kind `under_contract` is already the hand-off point).

## Roadmap status

| Phase | Item | Status |
|---|---|---|
| 1 | Auth, schema, property / owner / contact / entity / buyer profiles, notes + activity, imports, search, dashboard | **Done** |
| 1+ | Basic opportunities, tasks, commission defaults, data-quality dashboard | **Done** (pulled forward; the dashboard needs them) |
| 2 | Prospecting lists, owner call queue, outreach logging, suppression + exports | **Done** |
| 2 | Ranked buyer matching with reasons/conflicts → outreach tasks | **Done** |
| 2 | Kanban board (drag/drop), commission forecast by month | **Done** |
| 2 | Property map + geocoding | Next (needs Google/Mapbox key or Census batch geocode) |
| 3 | Gmail, Google Calendar, AI summaries / follow-ups, document extraction w/ review, natural-language search | |
| 4 | Transactions + deadline engine, comps DB, campaigns, underwriting integration, ownership graph, analytics | |

## Prospecting rules

- The queue works **owners**, not parcels: one touch updates every property that owner has on the list.
- Default follow-up spacing: no answer 3d, voicemail 4d, sent 10d, talked 30–90d, interested 7d, not interested 180d. Override per touch.
- "Do not contact" flags the owner, suppresses its phone and mailing address everywhere, and pulls it from every list.
  Exports drop suppressed owners and blank suppressed phones/addresses.
- County phones are **not** scrubbed against the National DNC Registry. Scrub before cold-calling.

## Buyer matching

`src/lib/matching.ts` scores each active criteria profile on market (30), price (25), units (20), type (10), equity (10) and live 1031 (5).
Only preferences both sides know can score. Unknowns are listed, and any known mismatch makes it a conflict, ranked last.
Equity check assumes ~35% down and says so. Price within 10% over max is a note, not a conflict.

## Known limitations

- APNs are deduped on digits only and shown in the county file's grouping. A source using a different digit layout won't match automatically.
- No geocoding yet (no lat/long in the source file). The map needs a Google or Mapbox key (Phase 2).
- Owner-type classification is pattern-based. Roughly 2% land in `unknown`. Edit on the owner page; reclassify never touches manual edits.
- County lists repeat a complex's totals on each parcel. Rows with the same owner + identical units + land + improvement values merge into
  one property with several APNs (365 rows in the 2026 file). Two genuinely separate buildings with identical values to the dollar would also merge.
- Uploads through Vercel are capped at ~4.5 MB per request. Use the CLI importer for bigger files.
