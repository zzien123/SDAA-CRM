set search_path = crm, public;

-- ---------------------------------------------------------------------------
-- Suppression: owner-level do-not-contact + value-level suppressions that apply everywhere
-- (a phone opted out once is suppressed on every owner that shares it)
-- ---------------------------------------------------------------------------
alter table entities add column do_not_contact boolean not null default false;
alter table entities add column dnc_reason text;
alter table entities add column dnc_at timestamptz;

create table suppressions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  kind         text not null check (kind in ('phone','email','mailing_address')),
  value        text not null,       -- normalized: phone digits, lower(email), normalized mailing key
  reason       text not null,       -- 'do_not_contact', 'wrong_number', 'opt_out', 'returned_mail', ...
  entity_id    uuid references entities(id) on delete set null,
  contact_id   uuid references contacts(id) on delete set null,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  unique (org_id, kind, value)
);

-- ---------------------------------------------------------------------------
-- Prospect lists (snapshots of a property filter) and per-property working status
-- ---------------------------------------------------------------------------
create table prospect_lists (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  description  text,
  filters      jsonb not null default '{}'::jsonb,
  is_archived  boolean not null default false,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create type prospect_status as enum ('queued','attempting','connected','interested','not_interested','do_not_contact','converted','skipped');

create table prospect_list_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  list_id         uuid not null references prospect_lists(id) on delete cascade,
  property_id     uuid not null references properties(id) on delete cascade,
  entity_id       uuid references entities(id) on delete set null,   -- owner when added; queue groups by this
  status          prospect_status not null default 'queued',
  priority        smallint not null default 2 check (priority between 1 and 3),
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  next_action     text,
  next_action_date date,
  notes           text,
  opportunity_id  uuid references opportunities(id) on delete set null,
  added_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (list_id, property_id)
);
create index pli_queue_idx on prospect_list_items(list_id, status, next_action_date);
create index pli_entity_idx on prospect_list_items(entity_id);
create trigger pli_touch before update on prospect_list_items for each row execute function crm.touch_updated_at();
create trigger prospect_lists_touch before update on prospect_lists for each row execute function crm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Owner suppression status, reusable by queue, exports and dashboard
-- ---------------------------------------------------------------------------
create or replace view crm.entity_contactability as
select e.id as entity_id, e.org_id,
  e.do_not_contact
    or exists (select 1 from crm.entity_people ep join crm.contacts c on c.id = ep.contact_id
               where ep.entity_id = e.id and c.do_not_contact and ep.role in ('beneficial_owner','managing_member','general_partner','trustee'))
    as owner_suppressed,
  (e.phone is not null and exists (select 1 from crm.suppressions s where s.org_id = e.org_id and s.kind = 'phone'
       and s.value = regexp_replace(e.phone, '\D', '', 'g'))) as phone_suppressed,
  (e.mailing_normalized is not null and exists (select 1 from crm.suppressions s where s.org_id = e.org_id and s.kind = 'mailing_address'
       and s.value = e.mailing_normalized)) as mail_suppressed
from crm.entities e;

alter table suppressions enable row level security;
alter table prospect_lists enable row level security;
alter table prospect_list_items enable row level security;
