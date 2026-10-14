import "server-only";
import { sql } from "./db";
import { geocode } from "./geocode";

const RETRY_FAILED_AFTER_DAYS = 30;

/** Geocode a property if it has no coordinates yet. Never touches a manual pin. Returns the row's coordinates. */
export async function ensureGeocoded(orgId: string, propertyId: string) {
  const [p] = await sql`select id, street_address, city, zip, latitude, longitude, geocode_status, geocode_source, geocode_matched_address, geocoded_at from properties where id = ${propertyId} and org_id = ${orgId}`;
  if (!p) return null;
  if (p.latitude !== null && p.longitude !== null) return p;
  if (p.geocode_status === "failed" && p.geocoded_at && Date.now() - new Date(p.geocoded_at).getTime() < RETRY_FAILED_AFTER_DAYS * 86400000) return p;
  const g = await geocode(p.street_address, p.city, p.zip);
  const [u] = g
    ? await sql`update properties set latitude = ${g.lat}, longitude = ${g.lng}, geocode_status = ${g.status}, geocode_source = ${g.source},
                  geocode_matched_address = ${g.matched}, geocoded_at = now()
                where id = ${propertyId} and latitude is null returning id, latitude, longitude, geocode_status, geocode_source, geocode_matched_address`
    : await sql`update properties set geocode_status = 'failed', geocoded_at = now() where id = ${propertyId} and latitude is null
                returning id, latitude, longitude, geocode_status`;
  return u ?? p;
}
