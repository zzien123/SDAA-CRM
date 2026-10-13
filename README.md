# SDAA CRM — Phase 1

Property-centric CRM for San Diego Apartment Advisors. Next.js 15 (App Router) · TypeScript · Tailwind · Postgres (Supabase) · Supabase Auth.

**What works today:** dashboard + daily action center, property database (16k+ rows, filters, CSV export), ownership-entity mapping with
evidence/confidence, owner and contact profiles with unified relationship timelines, buyers with multiple acquisition-criteria profiles,
basic opportunity pipeline with commission math, tasks with recurrence, universal search, Excel/CSV import with dry run, dedupe, review
queue and rollback, data-quality dashboard, audit log. See `docs/ARCHITECTURE.md` for the schema and roadmap.

## Run it locally (about 5 minutes)

Needs Node 20+ and Postgres 15+ (or a Supabase project).

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL; for local use, uncomment AUTH_MODE=dev + DEV_USER_EMAIL
npm run db:migrate              # creates the `crm` schema
npm run import:file -- ~/Downloads/SAN_DIEGO_2026Edition.xlsx   # optional: load the county list (~10s)
npm run dev                     # http://localhost:3000
```

## Deploy (Supabase + Vercel)

1. **Supabase:** create a project. Copy the *Session pooler* connection string (port 5432) into `DATABASE_URL`, plus the project URL and anon key.
2. **Migrate:** from your machine, `DATABASE_URL=... npm run db:migrate`.
3. **Auth:** Supabase → Authentication → URL Configuration: set *Site URL* to your Vercel URL and add `https://<your-app>.vercel.app/auth/callback` to redirect URLs. Email magic link is on by default.
4. **Vercel:** import the repo, add the env vars from `.env.example` (do **not** set `AUTH_MODE`), deploy.
5. **Load data:** Import & Data Quality → Import file (files up to ~4 MB through Vercel; larger files: `npm run import:file` from your machine with the production `DATABASE_URL`).

Security notes: all tables live in the `crm` schema, which Supabase's auto-generated REST API does not expose, and RLS is enabled with no
policies, so the anon key can't read CRM data. Only the Next.js server (holding `DATABASE_URL`) can. Every query is scoped to the user's org.
Sign-in is limited to `ALLOWED_EMAILS`.

## Scripts

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply `db/migrations/*.sql` in order (tracked in `public.schema_migrations`) |
| `npm run import:file -- <path>` | Import a property/owner list from the command line (same engine as the UI) |
| `npm run import:rollback -- <importId>` | Undo an import (refuses if you've logged work against its records) |
| `npm run entities:reclassify` | Re-run the owner-type classifier on imported owners (manual edits untouched) |
| `npm test` | Unit tests + importer integration test (uses a throwaway `crm_unit` database) |
| `node tests/e2e.cjs http://localhost:3001` | 19-step browser workflow test against a dev server on a **test** database |

## Importing the county list

Auto-mapping recognizes the `SAN_DIEGO_2026Edition.xlsx` layout, including the phone column mislabeled `Owner`. What the importer does with it:

- **Dedupes** properties by APN (digits only), then by normalized address + city. Owners dedupe on normalized name **+** mailing address. The same name at a different address stays separate and shows up under *Possible duplicates*.
- **Never overwrites.** Re-importing fills blank fields only. A different owner on an existing property goes to *Ownership changes to review* instead of replacing the current owner.
- **Rejects** shifted or garbage rows (the last 7 rows of the 2026 file) and logs why.
- **Flags** instead of guessing: 0 units → unknown, `00-00-1900` sale dates → unknown, address ranges, missing ZIPs.
- **Doesn't invent people.** Owner names become ownership *entities*. "In care of" names stay on the entity until you click *Create contact from c/o*. Phones are labeled unverified, and a number shared by 3+ unrelated owners is flagged as a likely management company.
