-- SDAA CRM — core schema (Phase 1 + forward-compatible tables for Phase 2)
-- Everything lives in the `crm` schema, which Supabase does NOT expose through its
-- auto-generated REST API. Only the Next.js server (holding DATABASE_URL) can reach it.

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create schema if not exists crm;
set search_path = crm, public;

-- ---------------------------------------------------------------------------
-- Tenancy & users (single broker today, team-ready)
-- ---------------------------------------------------------------------------
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  settings      jsonb not null default '{}'::jsonb,   -- commission defaults, etc.
  created_at    timestamptz not null default now()
);

create table users (
  id            uuid primary key,                      -- = Supabase auth.users.id
  email         text not null unique,
  full_name     text,
  created_at    timestamptz not null default now()
);

create type member_role as enum ('admin','broker','agent','analyst','transaction_coordinator');

create table memberships (
  org_id        uuid not null references organizations(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          member_role not null default 'broker',
  primary key (org_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Provenance: every import is logged; created rows point back to it for rollback
-- ---------------------------------------------------------------------------
create table imports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  filename      text not null,
  kind          text not null,                 -- 'property_owner_list', 'contacts', 'buyers'
  mapping       jsonb not null default '{}'::jsonb,
  status        text not null default 'running' check (status in ('running','completed','failed','rolled_back')),
  stats         jsonb not null default '{}'::jsonb,
  error         text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  rolled_back_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Properties & parcels
-- ---------------------------------------------------------------------------
create type listing_status as enum ('none','off_market_opportunity','active_listing','in_escrow','sold','withdrawn');
create type confidence_level as enum ('unverified','public_record','reported','verified');

create table properties (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  name               text,
  street_address     text not null,
  address_normalized text not null,
  city               text,
  state              text not null default 'CA',
  zip                text,
  county             text default 'San Diego',
  latitude           double precision,
  longitude          double precision,
  property_type      text,                       -- 'multifamily_5plus', 'multifamily_2_4', 'mixed_use', 'commercial', 'land', ...
  units              integer check (units is null or units >= 0),
  unit_mix           jsonb,                      -- [{"type":"1x1","count":6,"avg_rent":1950}]
  building_sf        integer,
  lot_sf             integer,
  year_built         integer,
  year_renovated     integer,
  floors             integer,
  construction_type  text,
  zoning             text,
  parking            text,
  land_value         numeric(14,2),
  improvement_value  numeric(14,2),
  assessed_value     numeric(14,2) generated always as (coalesce(land_value,0) + coalesce(improvement_value,0)) stored,
  estimated_value    numeric(14,2),
  estimated_value_source text,
  last_sale_date     date,
  last_sale_price    numeric(14,2),
  estimated_debt     numeric(14,2),
  estimated_debt_source text,
  listing_status     listing_status not null default 'none',
  -- underwriting hooks (Phase 4 module writes these back)
  current_noi        numeric(14,2),
  stabilized_noi     numeric(14,2),
  asking_price       numeric(14,2),
  notes              text,
  data_flags         text[] not null default '{}',   -- importer / DQ flags, e.g. 'units_outlier'
  source             text,
  source_import_id   uuid references imports(id) on delete set null,
  search_text        text not null default '',
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index properties_org_idx on properties(org_id);
create index properties_addr_idx on properties(org_id, address_normalized);
create index properties_city_idx on properties(org_id, city);
create index properties_zip_idx on properties(org_id, zip);
create index properties_units_idx on properties(org_id, units);
create index properties_sale_idx on properties(org_id, last_sale_date);
create index properties_status_idx on properties(org_id, listing_status);
create index properties_search_trgm on properties using gin (search_text gin_trgm_ops);
create index properties_import_idx on properties(source_import_id);

-- One property may span several APNs (assemblages, multi-parcel buildings)
create table parcels (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  apn           text not null,          -- normalized 10-digit, formatted XXX-XXX-XX-XX
  apn_raw       text,
  created_at    timestamptz not null default now(),
  unique (org_id, apn)
);
create index parcels_property_idx on parcels(property_id);
create index parcels_apn_trgm on parcels using gin (apn gin_trgm_ops);

create table portfolios (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  notes         text,
  created_at    timestamptz not null default now()
);
create table portfolio_properties (
  portfolio_id  uuid not null references portfolios(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  primary key (portfolio_id, property_id)
);

-- ---------------------------------------------------------------------------
-- Ownership entities (owner of record: LLC, trust, partnership, or a person's name on title)
-- ---------------------------------------------------------------------------
create type entity_type as enum ('individual','trust','llc','limited_partnership','partnership','corporation','nonprofit','government','other','unknown');

create table entities (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  name               text not null,
  name_normalized    text not null,
  entity_type        entity_type not null default 'unknown',
  care_of_name       text,                    -- "In care of" on the tax roll. NOT assumed to be the owner.
  mailing_address    text,
  mailing_city       text,
  mailing_state      text,
  mailing_zip        text,
  mailing_normalized text,
  phone              text,
  phone_source       text,
  phone_shared_count integer not null default 0,  -- # of other owner names sharing this phone (mgmt co. signal)
  sos_file_number    text,
  notes              text,
  data_flags         text[] not null default '{}',
  source             text,
  source_import_id   uuid references imports(id) on delete set null,
  search_text        text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index entities_org_idx on entities(org_id);
create index entities_name_idx on entities(org_id, name_normalized);
create index entities_search_trgm on entities using gin (search_text gin_trgm_ops);
create index entities_phone_idx on entities(org_id, phone);
create index entities_import_idx on entities(source_import_id);

-- Property <-> entity over time. Ownership changes close the old row (end_date) rather than overwrite it.
create table property_ownerships (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  property_id     uuid not null references properties(id) on delete cascade,
  entity_id       uuid not null references entities(id) on delete cascade,
  vesting_role    text not null default 'owner_of_record',  -- 'owner_of_record', 'second_name_on_title', 'co_owner'
  ownership_pct   numeric(6,3) check (ownership_pct is null or (ownership_pct > 0 and ownership_pct <= 100)),
  start_date      date,
  end_date        date,
  is_current      boolean not null default true,
  source          text not null,
  verified_at     date,
  confidence      confidence_level not null default 'unverified',
  source_import_id uuid references imports(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index po_property_idx on property_ownerships(property_id) where is_current;
create index po_entity_idx on property_ownerships(entity_id) where is_current;
create unique index po_unique_current on property_ownerships(property_id, entity_id, vesting_role) where is_current;

-- ---------------------------------------------------------------------------
-- Contacts (people) & companies
-- ---------------------------------------------------------------------------
create table companies (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  company_type  text,           -- 'property_management','brokerage','lender','escrow','title','law_firm','other'
  phone         text,
  website       text,
  address       text,
  notes         text,
  search_text   text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index companies_search_trgm on companies using gin (search_text gin_trgm_ops);

create type contact_category as enum ('property_owner','investor_buyer','seller','broker','property_manager','attorney','lender','escrow_officer','title_rep','contractor','other_professional');
create type relationship_status as enum ('new','attempting','connected','relationship','client','cold','do_not_contact');

create table contacts (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  first_name           text,
  last_name            text,
  full_name            text generated always as (nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')) stored,
  company_id           uuid references companies(id) on delete set null,
  title                text,
  mailing_address      text,
  mailing_city         text,
  mailing_state        text,
  mailing_zip          text,
  preferred_method     text check (preferred_method is null or preferred_method in ('call','text','email','mail','in_person')),
  geographic_focus     text[] not null default '{}',
  relationship_status  relationship_status not null default 'new',
  last_contacted_at    timestamptz,
  next_follow_up_at    date,
  personal_notes       text,
  relationship_source  text,
  do_not_contact       boolean not null default false,
  source_import_id     uuid references imports(id) on delete set null,
  search_text          text not null default '',
  owner_user_id        uuid references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint contacts_name_required check (coalesce(first_name, last_name) is not null)
);
create index contacts_org_idx on contacts(org_id);
create index contacts_followup_idx on contacts(org_id, next_follow_up_at);
create index contacts_search_trgm on contacts using gin (search_text gin_trgm_ops);

create table contact_categories (
  contact_id    uuid not null references contacts(id) on delete cascade,
  category      contact_category not null,
  primary key (contact_id, category)
);

create table contact_phones (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  phone         text not null,
  phone_digits  text not null,
  label         text default 'mobile',
  is_primary    boolean not null default false,
  do_not_call   boolean not null default false,
  source        text,
  verified_at   date
);
create index contact_phones_digits_idx on contact_phones(phone_digits);

create table contact_emails (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  email         text not null,
  label         text default 'work',
  is_primary    boolean not null default false,
  opted_out     boolean not null default false,
  source        text,
  verified_at   date
);
create index contact_emails_email_idx on contact_emails(lower(email));

-- People behind entities. Beneficial ownership only when evidence supports it.
create type entity_person_role as enum ('beneficial_owner','managing_member','member','general_partner','limited_partner','trustee','beneficiary','officer','authorized_representative','registered_agent','in_care_of','other');

create table entity_people (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  entity_id       uuid not null references entities(id) on delete cascade,
  contact_id      uuid not null references contacts(id) on delete cascade,
  role            entity_person_role not null,
  ownership_pct   numeric(6,3) check (ownership_pct is null or (ownership_pct > 0 and ownership_pct <= 100)),
  is_decision_maker boolean,
  source          text not null,
  verified_at     date,
  confidence      confidence_level not null default 'unverified',
  notes           text,
  start_date      date,
  end_date        date,
  created_at      timestamptz not null default now(),
  unique (entity_id, contact_id, role)
);
create index entity_people_contact_idx on entity_people(contact_id);

-- Contacts tied directly to a property (PM, owner's rep, onsite manager, tenant...)
create table property_contacts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete cascade,
  company_id    uuid references companies(id) on delete cascade,
  role          text not null,   -- 'property_manager','owner_representative','decision_maker','onsite_manager','listing_broker','other'
  notes         text,
  source        text,
  created_at    timestamptz not null default now(),
  constraint property_contacts_target check (contact_id is not null or company_id is not null)
);
create index property_contacts_property_idx on property_contacts(property_id);
create index property_contacts_contact_idx on property_contacts(contact_id);

-- ---------------------------------------------------------------------------
-- Buyers: one contact may hold several acquisition-criteria profiles
-- ---------------------------------------------------------------------------
create table buyer_criteria (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  contact_id            uuid not null references contacts(id) on delete cascade,
  label                 text not null,
  is_active             boolean not null default true,
  target_markets        text[] not null default '{}',   -- cities / neighborhoods / zips
  property_types        text[] not null default '{}',
  min_units             integer,
  max_units             integer,
  min_price             numeric(14,2),
  max_price             numeric(14,2),
  available_equity      numeric(14,2),
  financing_preference  text,     -- 'all_cash','agency','bank','seller_financing','assumable','any'
  target_cap_rate       numeric(5,3),
  target_coc            numeric(5,3),
  target_irr            numeric(5,3),
  strategy              text check (strategy is null or strategy in ('value_add','stabilized','development','owner_user','any')),
  seller_financing_interest boolean,   -- null = unknown, never treated as yes
  is_1031               boolean,
  exchange_relinquished_close date,
  exchange_id_deadline  date,
  exchange_close_deadline date,
  timeline              text,
  notes                 text,
  last_confirmed_at     date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint units_range check (min_units is null or max_units is null or min_units <= max_units),
  constraint price_range check (min_price is null or max_price is null or min_price <= max_price)
);
create index buyer_criteria_contact_idx on buyer_criteria(contact_id);

-- ---------------------------------------------------------------------------
-- Opportunities (pipeline). Kanban/forecasting UI lands in Phase 2; data model is here now.
-- ---------------------------------------------------------------------------
create table pipeline_stages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  position      integer not null,
  default_probability numeric(5,2) not null default 0,
  kind          text not null default 'open' check (kind in ('open','under_contract','won','lost')),
  unique (org_id, position) deferrable initially deferred
);

create table opportunities (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  name                  text not null,
  property_id           uuid references properties(id) on delete set null,
  stage_id              uuid not null references pipeline_stages(id),
  side                  text not null default 'seller' check (side in ('seller','buyer','dual')),
  seller_contact_id     uuid references contacts(id) on delete set null,
  seller_entity_id      uuid references entities(id) on delete set null,
  buyer_contact_id      uuid references contacts(id) on delete set null,
  asking_price          numeric(14,2),
  expected_price        numeric(14,2),
  probability           numeric(5,2) check (probability is null or (probability >= 0 and probability <= 100)),
  expected_close_date   date,
  commission_rate       numeric(6,4),    -- e.g. 0.0300
  brokerage_split       numeric(6,4),    -- broker's share after house split, e.g. 0.7000
  deal_source           text,
  next_action           text,
  next_action_date      date,
  notes                 text,
  stage_changed_at      timestamptz not null default now(),
  closed_at             timestamptz,
  lost_reason           text,
  owner_user_id         uuid references users(id),
  search_text           text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index opportunities_org_stage_idx on opportunities(org_id, stage_id);
create index opportunities_property_idx on opportunities(property_id);
create index opportunities_search_trgm on opportunities using gin (search_text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Activities (unified relationship timeline) and tasks
-- ---------------------------------------------------------------------------
create type activity_type as enum ('call','email','text','letter','meeting','in_person','note','status_change','document','system');

create table activities (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  type            activity_type not null,
  direction       text check (direction is null or direction in ('outbound','inbound')),
  outcome         text,   -- 'no_answer','left_voicemail','conversation','meaningful_conversation','not_interested','open_to_selling','wrong_number','meeting_set'
  subject         text,
  body            text,
  occurred_at     timestamptz not null default now(),
  property_id     uuid references properties(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete cascade,
  entity_id       uuid references entities(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete cascade,
  is_private      boolean not null default false,
  external_ref    text,     -- Gmail message id / Calendar event id (Phase 3)
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index activities_org_time_idx on activities(org_id, occurred_at desc);
create index activities_property_idx on activities(property_id, occurred_at desc);
create index activities_contact_idx on activities(contact_id, occurred_at desc);
create index activities_entity_idx on activities(entity_id, occurred_at desc);
create index activities_opp_idx on activities(opportunity_id, occurred_at desc);

create type task_status as enum ('open','done','canceled');
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  type            text not null default 'custom' check (type in ('call_owner','follow_up_buyer','send_financials','request_rent_roll','prepare_valuation','schedule_tour','submit_offer','review_documents','transaction_deadline','custom')),
  title           text not null,
  due_date        date,
  priority        smallint not null default 2 check (priority between 1 and 3),  -- 1 high, 2 normal, 3 low
  status          task_status not null default 'open',
  notes           text,
  recurrence_days integer check (recurrence_days is null or recurrence_days > 0),
  property_id     uuid references properties(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete cascade,
  entity_id       uuid references entities(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete cascade,
  assignee_user_id uuid references users(id),
  completed_at    timestamptz,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tasks_org_due_idx on tasks(org_id, status, due_date);

-- ---------------------------------------------------------------------------
-- Documents (Supabase Storage objects; extraction review is Phase 3)
-- ---------------------------------------------------------------------------
create table documents (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  filename        text not null,
  storage_path    text not null,
  doc_type        text,   -- 'om','rent_roll','t12','psa','listing_agreement','tax_bill','insurance','loan','escrow','photo','other'
  version         integer not null default 1,
  supersedes_id   uuid references documents(id),
  property_id     uuid references properties(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete cascade,
  uploaded_by     uuid references users(id),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table audit_log (
  id            bigserial primary key,
  org_id        uuid,
  user_id       uuid,
  table_name    text not null,
  record_id     uuid,
  action        text not null,
  changes       jsonb,
  at            timestamptz not null default now()
);
create index audit_log_record_idx on audit_log(table_name, record_id);

-- ---------------------------------------------------------------------------
-- Search text maintenance
-- ---------------------------------------------------------------------------
create or replace function crm.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function crm.properties_search() returns trigger language plpgsql as $$
begin
  new.search_text := lower(concat_ws(' ', new.name, new.street_address, new.city, new.zip));
  return new;
end $$;
create trigger properties_search_t before insert or update on properties for each row execute function crm.properties_search();
create trigger properties_touch before update on properties for each row execute function crm.touch_updated_at();

create or replace function crm.entities_search() returns trigger language plpgsql as $$
begin
  new.search_text := lower(concat_ws(' ', new.name, new.care_of_name, new.mailing_address, new.mailing_city, regexp_replace(coalesce(new.phone,''), '\D', '', 'g')));
  return new;
end $$;
create trigger entities_search_t before insert or update on entities for each row execute function crm.entities_search();
create trigger entities_touch before update on entities for each row execute function crm.touch_updated_at();

create or replace function crm.contacts_search() returns trigger language plpgsql as $$
begin
  new.search_text := lower(concat_ws(' ', new.first_name, new.last_name, new.title, new.mailing_city,
     (select name from crm.companies c where c.id = new.company_id)));
  return new;
end $$;
create trigger contacts_search_t before insert or update on contacts for each row execute function crm.contacts_search();
create trigger contacts_touch before update on contacts for each row execute function crm.touch_updated_at();

create or replace function crm.companies_search() returns trigger language plpgsql as $$
begin new.search_text := lower(concat_ws(' ', new.name, new.company_type)); return new; end $$;
create trigger companies_search_t before insert or update on companies for each row execute function crm.companies_search();

create or replace function crm.opportunities_search() returns trigger language plpgsql as $$
begin new.search_text := lower(concat_ws(' ', new.name, new.deal_source, new.notes)); return new; end $$;
create trigger opportunities_search_t before insert or update on opportunities for each row execute function crm.opportunities_search();
create trigger opportunities_touch before update on opportunities for each row execute function crm.touch_updated_at();
create trigger tasks_touch before update on tasks for each row execute function crm.touch_updated_at();
create trigger buyer_criteria_touch before update on buyer_criteria for each row execute function crm.touch_updated_at();

-- Keep contacts.last_contacted_at in sync with logged outreach
create or replace function crm.activities_touch_contact() returns trigger language plpgsql as $$
begin
  if new.contact_id is not null and new.type in ('call','email','text','letter','meeting','in_person') then
    update crm.contacts set last_contacted_at = greatest(coalesce(last_contacted_at, new.occurred_at), new.occurred_at)
     where id = new.contact_id;
  end if;
  return new;
end $$;
create trigger activities_contact_t after insert on activities for each row execute function crm.activities_touch_contact();

-- ---------------------------------------------------------------------------
-- Reporting view: property facts + current primary owner, used by lists, filters, exports
-- ---------------------------------------------------------------------------
create or replace view crm.property_overview as
select p.*,
  (select string_agg(pc.apn, ', ' order by pc.apn) from crm.parcels pc where pc.property_id = p.id) as apns,
  o.entity_id   as owner_entity_id,
  e.name        as owner_name,
  e.entity_type as owner_type,
  e.mailing_city as owner_mailing_city,
  e.mailing_state as owner_mailing_state,
  e.mailing_zip as owner_mailing_zip,
  e.phone       as owner_phone,
  o.confidence  as owner_confidence,
  case when p.last_sale_date is null then null
       else extract(year from age(current_date, p.last_sale_date))::int end as tenure_years,
  (e.mailing_state is not null and e.mailing_state <> 'CA') as owner_out_of_state,
  (e.mailing_zip is not null and p.zip is not null and left(e.mailing_zip,5) <> left(p.zip,5)) as owner_absentee,
  (select max(a.occurred_at) from crm.activities a
     where a.property_id = p.id and a.type in ('call','email','text','letter','meeting','in_person')) as last_outreach_at
from crm.properties p
left join lateral (
  select po.* from crm.property_ownerships po
  where po.property_id = p.id and po.is_current
  order by (po.vesting_role = 'owner_of_record') desc, po.created_at
  limit 1) o on true
left join crm.entities e on e.id = o.entity_id;

-- Lock down: enable RLS on everything (no policies => no access via Supabase anon/authenticated roles).
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'crm' loop
    execute format('alter table crm.%I enable row level security', t.tablename);
  end loop;
end $$;
