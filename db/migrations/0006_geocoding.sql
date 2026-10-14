set search_path = crm, public, extensions;

-- Geocoding provenance. Coordinates are looked up on demand (first time a property is opened) or in bulk,
-- and never silently overwrite a pin you placed by hand.
alter table properties add column geocode_status text check (geocode_status in ('matched','approximate','manual','failed'));
alter table properties add column geocode_source text;
alter table properties add column geocoded_at timestamptz;
alter table properties add column geocode_matched_address text;
create index properties_latlng_idx on properties(org_id, latitude, longitude) where latitude is not null;
