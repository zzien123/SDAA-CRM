set search_path = crm, public, extensions;

-- Row-level provenance for every import so it can be rolled back precisely.
create table import_records (
  id          bigserial primary key,
  import_id   uuid not null references imports(id) on delete cascade,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('created','updated')),
  previous    jsonb      -- prior values for 'updated' rows
);
create index import_records_import_idx on import_records(import_id, table_name);

-- Rows the importer refused (bad/shifted data); shown in the import log for manual review
create table import_rejections (
  id          bigserial primary key,
  import_id   uuid not null references imports(id) on delete cascade,
  row_number  integer not null,
  reason      text not null,
  raw         jsonb not null
);

-- When an import or research says a property's owner changed, it lands here for review
-- instead of silently overwriting the current owner of record.
create table ownership_reviews (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  property_id        uuid not null references properties(id) on delete cascade,
  current_entity_id  uuid references entities(id) on delete set null,
  proposed_entity_id uuid not null references entities(id) on delete cascade,
  proposed_sale_date date,
  source             text not null,
  import_id          uuid references imports(id) on delete cascade,
  status             text not null default 'pending' check (status in ('pending','accepted','rejected')),
  resolved_by        uuid references users(id),
  resolved_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index ownership_reviews_pending on ownership_reviews(org_id) where status = 'pending';

alter table import_records enable row level security;
alter table import_rejections enable row level security;
alter table ownership_reviews enable row level security;
