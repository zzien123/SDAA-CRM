import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { propertyOrder, propertyWhere, type PropertyFilters } from "@/lib/property-filters";

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const s = await requireSession();
  const f = Object.fromEntries(new URL(req.url).searchParams) as PropertyFilters;
  const cols = ["street_address", "city", "zip", "apns", "units", "year_built", "construction_type", "assessed_value", "last_sale_date", "tenure_years",
    "owner_name", "owner_type", "owner_mailing_city", "owner_mailing_state", "owner_mailing_zip", "owner_phone", "owner_absentee", "owner_out_of_state",
    "listing_status", "last_outreach_at", "data_flags"];
  const rows = await sql`select ${sql(cols.filter((c) => c !== "owner_phone"))},
      case when ec.phone_suppressed or ec.owner_suppressed then null else owner_phone end as owner_phone,
      coalesce(ec.owner_suppressed, false) as owner_do_not_contact
    from property_overview left join entity_contactability ec on ec.entity_id = property_overview.owner_entity_id
    where ${propertyWhere(s.orgId, f)} ${propertyOrder(f)} limit 25000`;
  cols.push("owner_do_not_contact");
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  await sql`insert into audit_log (org_id, user_id, table_name, action, changes) values (${s.orgId}, ${s.userId}, 'properties', 'export', ${sql.json({ filters: f, rows: rows.length } as never)})`;
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="properties-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
