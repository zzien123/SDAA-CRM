import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per owner. Suppressed owners are dropped; suppressed phones / mailing addresses are blanked. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") === "calls" ? "calls" : "mail";
  const [list] = await sql`select name from prospect_lists where id = ${id} and org_id = ${s.orgId}`;
  if (!list) return new Response("Not found", { status: 404 });
  const rows = await sql`
    select e.name as owner_name, e.entity_type, e.care_of_name,
           case when ec.mail_suppressed then null else e.mailing_address end as mailing_address,
           case when ec.mail_suppressed then null else e.mailing_city end as mailing_city,
           case when ec.mail_suppressed then null else e.mailing_state end as mailing_state,
           case when ec.mail_suppressed then null else e.mailing_zip end as mailing_zip,
           case when ec.phone_suppressed then null else e.phone end as owner_phone,
           e.phone_shared_count > 1 as phone_shared,
           (select string_agg(c.full_name || ' (' || replace(ep.role::text,'_',' ') || ')', '; ') from entity_people ep join contacts c on c.id = ep.contact_id
              where ep.entity_id = e.id and not c.do_not_contact) as people,
           (array_agg(i.status))[1] as status, max(i.attempts) as attempts, min(i.next_action_date) as next_action_date,
           count(*) as properties, coalesce(sum(p.units),0) as units,
           string_agg(p.street_address || ', ' || coalesce(p.city,'') || coalesce(' (' || p.units || 'u)', ''), '; ' order by p.units desc nulls last) as property_list,
           (array_agg(p.street_address order by p.units desc nulls last))[1] as lead_property
    from prospect_list_items i
    join entities e on e.id = i.entity_id
    join entity_contactability ec on ec.entity_id = e.id
    join properties p on p.id = i.property_id
    where i.list_id = ${id} and not ec.owner_suppressed and i.status not in ('do_not_contact','converted')
    group by e.id, ec.mail_suppressed, ec.phone_suppressed
    order by units desc`;
  const cols = format === "mail"
    ? ["owner_name", "care_of_name", "mailing_address", "mailing_city", "mailing_state", "mailing_zip", "lead_property", "properties", "units", "property_list"]
    : ["owner_name", "entity_type", "owner_phone", "phone_shared", "people", "status", "attempts", "next_action_date", "lead_property", "properties", "units", "property_list"];
  const data = format === "mail" ? rows.filter((r) => r.mailing_address) : rows;
  const body = [cols.join(","), ...data.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  await sql`insert into audit_log (org_id, user_id, table_name, record_id, action, changes) values (${s.orgId}, ${s.userId}, 'prospect_lists', ${id}, 'export', ${sql.json({ format, rows: data.length })})`;
  const name = String(list.name).replace(/[^\w]+/g, "-").slice(0, 50);
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}-${format}.csv"` } });
}
