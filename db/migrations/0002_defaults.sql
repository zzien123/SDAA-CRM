set search_path = crm, public;

-- Creates an organization with the default 12-stage pipeline. Idempotent per org name.
create or replace function crm.bootstrap_org(p_name text) returns uuid language plpgsql as $$
declare v_org uuid;
begin
  select id into v_org from crm.organizations where name = p_name limit 1;
  if v_org is not null then return v_org; end if;
  insert into crm.organizations(name, settings)
    values (p_name, jsonb_build_object('default_commission_rate', 0.03, 'default_brokerage_split', 0.70))
    returning id into v_org;
  insert into crm.pipeline_stages(org_id, name, position, default_probability, kind) values
    (v_org, 'Prospect Identified',      1,  2, 'open'),
    (v_org, 'Owner Contacted',          2,  4, 'open'),
    (v_org, 'Relationship Established', 3,  8, 'open'),
    (v_org, 'Potential Seller',         4, 15, 'open'),
    (v_org, 'Financials Requested',     5, 25, 'open'),
    (v_org, 'Underwriting',             6, 30, 'open'),
    (v_org, 'Buyer Outreach',           7, 40, 'open'),
    (v_org, 'Offer Submitted',          8, 50, 'open'),
    (v_org, 'Negotiating',              9, 60, 'open'),
    (v_org, 'Under Contract',          10, 80, 'under_contract'),
    (v_org, 'Closed',                  11,100, 'won'),
    (v_org, 'Lost / Inactive',         12,  0, 'lost');
  return v_org;
end $$;
