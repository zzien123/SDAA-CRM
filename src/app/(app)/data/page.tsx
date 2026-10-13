import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Badge, ButtonLink, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { Disclosure } from "@/components/forms";
import { Review, Rollback } from "./client";
import { ago, date, label, num } from "@/lib/utils";

export default async function DataPage() {
  const s = await requireSession();
  const o = s.orgId;
  const [[q], imports, reviews, dupEntities, dupContacts, rejections] = await Promise.all([
    sql`select
      (select count(*) from properties where org_id = ${o} and not exists (select 1 from parcels where property_id = properties.id))::int as no_apn,
      (select count(*) from properties where org_id = ${o} and units is null)::int as no_units,
      (select count(*) from properties where org_id = ${o} and zip is null)::int as no_zip,
      (select count(*) from properties where org_id = ${o} and last_sale_date is null)::int as no_sale,
      (select count(*) from properties p where org_id = ${o} and units >= 5 and not exists (
          select 1 from property_ownerships po join entity_people ep on ep.entity_id = po.entity_id where po.property_id = p.id and po.is_current))::int as no_decision_maker,
      (select count(distinct po.entity_id) from property_ownerships po where po.org_id = ${o} and po.is_current and po.confidence = 'unverified')::int as unverified_owners,
      (select count(*) from entities where org_id = ${o} and phone is null)::int as owners_no_phone,
      (select count(*) from entities where org_id = ${o} and phone_shared_count >= 2)::int as shared_phones,
      (select count(*) from contacts c where org_id = ${o} and not exists (select 1 from contact_phones where contact_id = c.id))::int as contacts_no_phone,
      (select count(*) from contacts c where org_id = ${o} and not exists (select 1 from contact_emails where contact_id = c.id))::int as contacts_no_email,
      (select count(*) from contacts where org_id = ${o} and next_follow_up_at is null and not do_not_contact)::int as no_followup,
      (select count(*) from contacts where org_id = ${o} and last_contacted_at < now() - interval '1 year')::int as stale_contacts,
      (select count(*) from property_ownerships po join imports i on i.id = po.source_import_id where po.org_id = ${o} and po.is_current and i.created_at < now() - interval '12 months')::int as stale_ownership`,
    sql`select i.*, u.email from imports i left join users u on u.id = i.created_by where i.org_id = ${o} order by i.created_at desc limit 25`,
    sql`select r.id, r.created_at, r.proposed_sale_date, r.source, p.id as property_id, p.street_address, p.city, ce.id as cur_id, ce.name as cur_name, ne.id as new_id, ne.name as new_name
        from ownership_reviews r join properties p on p.id = r.property_id left join entities ce on ce.id = r.current_entity_id join entities ne on ne.id = r.proposed_entity_id
        where r.org_id = ${o} and r.status = 'pending' order by r.created_at desc limit 100`,
    sql`select name_normalized, count(*)::int as n, array_agg(id) as ids, min(name) as name from entities where org_id = ${o} group by name_normalized having count(*) > 1 order by n desc limit 30`,
    sql`select lower(full_name) as k, count(*)::int as n, array_agg(id) as ids, min(full_name) as name from contacts where org_id = ${o} group by lower(full_name) having count(*) > 1 order by n desc limit 30`,
    sql`select r.row_number, r.reason, i.filename from import_rejections r join imports i on i.id = r.import_id where i.org_id = ${o} and i.status = 'completed' order by i.created_at desc, r.row_number limit 50`,
  ]);
  const Row = ({ n, text, href }: { n: number; text: string; href?: string }) => (
    <li className="flex items-center justify-between px-4 py-1.5 text-[13px]">
      {href && n > 0 ? <Link href={href} className="text-navy-800 hover:underline">{text}</Link> : <span>{text}</span>}
      <span className={`num ${n > 0 ? "font-medium" : "text-ink-400"}`}>{num(n)}</span>
    </li>
  );
  return (
    <>
      <PageHeader title="Import & data quality" actions={<ButtonLink href="/data/import">Import file</ButtonLink>} />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Properties" />
          <ul className="py-1">
            <Row n={q.no_units} text="Missing unit count" href="/properties?flag=units_unknown" />
            <Row n={q.no_apn} text="Missing APN" href="/properties?flag=missing_apn" />
            <Row n={q.no_zip} text="Missing ZIP" href="/properties?flag=missing_zip" />
            <Row n={q.no_sale} text="No last-sale date" href="/properties?flag=sale_date_missing" />
            <Row n={q.no_decision_maker} text="5+ units, no person linked to owner" href="/properties?min_units=5" />
          </ul>
        </Card>
        <Card>
          <CardHeader title="Owners" />
          <ul className="py-1">
            <Row n={reviews.length} text="Pending ownership changes" href="#reviews" />
            <Row n={q.unverified_owners} text="Unverified ownership links" />
            <Row n={q.stale_ownership} text="Ownership data older than 12 months" />
            <Row n={q.owners_no_phone} text="Owners with no phone" />
            <Row n={q.shared_phones} text="Owner phones shared by 3+ owners (likely managers)" />
            <Row n={dupEntities.length} text="Same owner name, different mailing address" href="#dupes" />
          </ul>
        </Card>
        <Card>
          <CardHeader title="Contacts" />
          <ul className="py-1">
            <Row n={q.contacts_no_phone} text="Missing phone" />
            <Row n={q.contacts_no_email} text="Missing email" />
            <Row n={q.no_followup} text="No follow-up date" href="/contacts?followup=none" />
            <Row n={q.stale_contacts} text="Not contacted in a year" href="/contacts?followup=stale" />
            <Row n={dupContacts.length} text="Possible duplicate names" href="#dupes" />
          </ul>
        </Card>
      </div>

      <Card id="reviews" className="mb-4">
        <CardHeader title="Ownership changes to review" sub="A newer import shows a different owner. The current owner stays until you accept." />
        <ul className="divide-y divide-ink-100">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
              <Link href={`/properties/${r.property_id}`} className="font-medium text-navy-800 hover:underline">{r.street_address}</Link>
              <span className="text-ink-500">{r.cur_name ?? "—"} →</span>
              <Link href={`/owners/${r.new_id}`} className="hover:underline">{r.new_name}</Link>
              {r.proposed_sale_date && <span className="text-2xs text-ink-500">sale {date(r.proposed_sale_date)}</span>}
              <span className="text-2xs text-ink-400">{r.source}</span>
              <span className="ml-auto"><Review id={r.id} /></span>
            </li>
          ))}
        </ul>
        {!reviews.length && <Empty>Nothing to review.</Empty>}
      </Card>

      <Card className="mb-4">
        <CardHeader title="Import history" />
        <div className="overflow-x-auto">
          <table className="table-compact w-full">
            <thead><tr><th>File</th><th>Type</th><th>When</th><th>Status</th><th>Result</th><th></th></tr></thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium">{i.filename}</td>
                  <td>{label(i.kind)}</td>
                  <td className="whitespace-nowrap">{date(i.created_at)} <span className="text-ink-400">{ago(i.created_at)}</span></td>
                  <td><Badge tone={i.status === "completed" ? "green" : i.status === "failed" ? "red" : "gray"}>{label(i.status)}</Badge>{i.error && <div className="text-2xs text-red-700">{i.error}</div>}</td>
                  <td className="text-2xs">{Object.entries(i.stats ?? {}).filter(([, v]) => typeof v === "number" && v > 0).map(([k, v]) => `${label(k)} ${num(v as number)}`).join(" · ")}</td>
                  <td>{i.status === "completed" && <Rollback id={i.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!imports.length && <Empty>No imports yet.</Empty>}
        </div>
        {rejections.length > 0 && (
          <div className="border-t border-ink-100 px-4 py-3">
            <Disclosure label={`Skipped rows (${rejections.length}${rejections.length === 50 ? "+" : ""})`}>
              <ul className="text-2xs text-ink-600">{rejections.map((r, i) => <li key={i}>{r.filename} · row {r.row_number}: {r.reason}</li>)}</ul>
            </Disclosure>
          </div>
        )}
      </Card>

      <Card id="dupes">
        <CardHeader title="Possible duplicates" sub="Never merged automatically. Same name alone doesn't mean same person or entity." />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <div className="field-label">Owners</div>
            {dupEntities.map((d) => (
              <div key={d.name_normalized} className="text-[13px]">{d.name} <span className="text-ink-500">×{d.n}:</span>{" "}
                {d.ids.map((id: string, i: number) => <Link key={id} href={`/owners/${id}`} className="mr-1 text-navy-700 hover:underline">#{i + 1}</Link>)}</div>
            ))}
            {!dupEntities.length && <p className="text-[13px] text-ink-500">None</p>}
          </div>
          <div>
            <div className="field-label">Contacts</div>
            {dupContacts.map((d) => (
              <div key={d.k} className="text-[13px]">{d.name} <span className="text-ink-500">×{d.n}:</span>{" "}
                {d.ids.map((id: string, i: number) => <Link key={id} href={`/contacts/${id}`} className="mr-1 text-navy-700 hover:underline">#{i + 1}</Link>)}</div>
            ))}
            {!dupContacts.length && <p className="text-[13px] text-ink-500">None</p>}
          </div>
        </div>
      </Card>
    </>
  );
}
