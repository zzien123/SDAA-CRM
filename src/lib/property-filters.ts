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

export function propertyWhere(orgId: string, f: PropertyFilters, table: "property_overview" | "properties" = "property_overview") {
  const c = [sql`${sql(table)}.org_id = ${orgId}`];
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

export function propertyOrderExpr(f: PropertyFilters) {
  const col = SORTS[f.sort ?? "units"] ?? "units";
  // "tenure" sorts by sale date: longest tenure = oldest sale first
  const desc = f.sort === "tenure" ? f.dir === "asc" : f.dir !== "asc";
  return sql`${sql(col)} ${desc ? sql`desc nulls last` : sql`asc nulls last`}, id`;
}

export function propertyOrder(f: PropertyFilters) {
  return sql`order by ${propertyOrderExpr(f)}`;
}

const FILTER_KEYS = ["q", "city", "zip", "min_units", "max_units", "min_year", "max_year", "min_tenure", "max_tenure", "owner_type",
  "absentee", "out_of_state", "status", "contacted", "flag", "sort", "dir"] as const;

/** Parse the list context carried in ?from= (the properties list's own query string). Unknown keys are dropped. */
export function filtersFromQuery(from: string | undefined): PropertyFilters {
  const p = new URLSearchParams(from ?? "");
  const f: PropertyFilters = {};
  for (const k of FILTER_KEYS) { const v = p.get(k); if (v) f[k] = v.slice(0, 200); }
  return f;
}

/** Position of a property inside a filtered, sorted list, plus its neighbors. */
export async function propertyNeighbors(orgId: string, id: string, f: PropertyFilters) {
  // The plain table is ~10x faster than the overview view; use it unless a filter/sort needs owner or outreach columns.
  const needsView = !!(f.q || f.owner_type || f.absentee || f.out_of_state || f.contacted || f.sort === "owner" || f.sort === "contacted");
  const source = needsView ? "property_overview" : "properties";
  const [r] = await sql`
    with r as (
      select id, row_number() over (order by ${propertyOrderExpr(f)}) as rn, count(*) over () as total
      from ${sql(source)} where ${propertyWhere(orgId, f, source)}
    ), me as (select rn from r where id = ${id})
    select (select rn from me)::int as pos, (select total from r limit 1)::int as total,
           (select id from r where rn = (select rn from me) - 1) as prev,
           (select id from r where rn = (select rn from me) + 1) as next`;
  return r as { pos: number | null; total: number | null; prev: string | null; next: string | null };
}
