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
| 2 | Prospecting lists + outreach workflow, suppression, Kanban, ranked buyer matching, map + geocoding, forecasting | Next |
| 3 | Gmail, Google Calendar, AI summaries / follow-ups, document extraction w/ review, natural-language search | |
| 4 | Transactions + deadline engine, comps DB, campaigns, underwriting integration, ownership graph, analytics | |

## Known limitations

- APNs are deduped on digits only and shown in the county file's grouping. A source using a different digit layout won't match automatically.
- No geocoding yet (no lat/long in the source file). The map needs a Google or Mapbox key (Phase 2).
- Owner-type classification is pattern-based. Roughly 2% land in `unknown`. Edit on the owner page; reclassify never touches manual edits.
- Uploads through Vercel are capped at ~4.5 MB per request. Use the CLI importer for bigger files.
