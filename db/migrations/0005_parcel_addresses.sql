set search_path = crm, public, extensions;

-- County lists repeat a complex's building totals on every parcel. Those rows are merged into one property
-- with several APNs; each parcel keeps its own situs address so search still finds it.
alter table parcels add column situs_address text;
update parcels pc set situs_address = p.street_address from properties p where p.id = pc.property_id and pc.situs_address is null;

create or replace function crm.properties_search() returns trigger language plpgsql as $$
begin
  new.search_text := lower(concat_ws(' ', new.name, new.street_address, new.city, new.zip,
    (select string_agg(pc.situs_address, ' ') from crm.parcels pc where pc.property_id = new.id and pc.situs_address is distinct from new.street_address)));
  return new;
end $$;

create or replace function crm.parcels_touch_property() returns trigger language plpgsql as $$
begin
  update crm.properties set updated_at = now() where id = coalesce(new.property_id, old.property_id);
  return null;
end $$;
create trigger parcels_touch_property after insert or update or delete on parcels for each row execute function crm.parcels_touch_property();
