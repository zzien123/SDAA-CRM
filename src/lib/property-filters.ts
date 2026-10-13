import "server-only";
import { sql } from "./db";

export type PropertyFilters = {
  q?: string; city?: string; zip?: string; min_units?: string; max_units?: string; min_year?: string; max_year?: string;
  min_tenure?: string; max_tenure?: string; owner_type?: string; absentee?: string; out_of_state?: string; status?: string;
  contacted?: string; flag?: string; sort?: string; dir?: string; page?: string;
};

const SORTS: Record<string, string> = {
  units: "units", address: "street_address", city: "city", year: "year_built", tenure: "last_sale_date",
  assessed: "assessed_value", owner: "owner_name", contacted: "last_outreach_at",
};

const int = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

export function propertyWhere(orgId: string, f: PropertyFilters) {
  const c = [sql`property_overview.org_id = ${orgId}`];
  if (f.q) for (const w of f.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) c.push(sql`(search_text ilike ${"%" + w + "%"} or apns like ${"%" + w + "%"} or lower(owner_name) like ${"%" + w + "%"})`);
  if (f.city) c.push(sql`city = ${f.city}`);
  if (f.zip) c.push(sql`zip = any(${f.zip.split(/[,\s]+/).filter(Boolean)})`);
  if (int(f.min_units) !== null) c.push(sql`units >= ${int(f.min_units)}`);
  if (int(f.max_units) !== null) c.push(sql`units <= ${int(f.max_units)}`);
  if (int(f.min_year) !== null) c.push(sql`year_built >= ${int(f.min_year)}`);
  if (int(f.max_year) !== null) c.push(sql`year_built <= ${int(f.max_year)}`);
  if (int(f.min_tenure) !== null) c.push(sql`last_sale_date <= current_date - make_interval(years => ${int(f.min_tenure)})`);
  if (int(f.max_tenure) !== null) c.push(sql`last_sale_date >= current_date - make_interval(years => ${int(f.max_tenure)})`);
  if (f.owner_type) c.push(sql`owner_type::text = any(${f.owner_type.split(",")})`);
  if (f.absentee === "1") c.push(sql`owner_absentee`);
  if (f.out_of_state === "1") c.push(sql`owner_out_of_state`);
  if (f.status) c.push(sql`listing_status = ${f.status}`);
  if (f.contacted === "never") c.push(sql`last_outreach_at is null`);
  if (f.contacted === "180") c.push(sql`(last_outreach_at is null or last_outreach_at < now() - interval '180 days')`);
  if (f.contacted === "recent") c.push(sql`last_outreach_at >= now() - interval '90 days'`);
  if (f.flag) c.push(sql`exists (select 1 from unnest(data_flags) fl where fl like ${f.flag + "%"})`);
  return c.reduce((a, b) => sql`${a} and ${b}`);
}

export function propertyOrder(f: PropertyFilters) {
  const col = SORTS[f.sort ?? "units"] ?? "units";
  // "tenure" sorts by sale date: longest tenure = oldest sale first
  const desc = f.sort === "tenure" ? f.dir === "asc" : f.dir !== "asc";
  return sql`order by ${sql(col)} ${desc ? sql`desc nulls last` : sql`asc nulls last`}, id`;
}
