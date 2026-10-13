import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { openTasks, timeline } from "@/lib/queries";
import { Badge, Card, CardHeader, Empty, confidenceTone } from "@/components/ui";
import { Disclosure } from "@/components/forms";
import { LogActivity, NewTask, TaskList, Timeline, type TaskRow, type TimelineItem } from "@/components/activity";
import { EntityEditForm, LinkPersonForm, PromoteCareOf, Unlink } from "./client";
import { DncToggle } from "../../prospecting/client";
import { ago, date, label, money, num } from "@/lib/utils";

export default async function OwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e] = await sql`select * from entities where id = ${id} and org_id = ${s.orgId}`;
  if (!e) notFound();
  const [props, past, people, related, acts, tasks] = await Promise.all([
    sql`select p.id, p.street_address, p.city, p.zip, p.units, p.year_built, p.assessed_value, p.last_sale_date, p.listing_status, po.vesting_role, po.confidence, po.source
        from property_ownerships po join properties p on p.id = po.property_id where po.entity_id = ${id} and po.is_current order by p.units desc nulls last`,
    sql`select p.id, p.street_address, p.city, po.start_date, po.end_date from property_ownerships po join properties p on p.id = po.property_id where po.entity_id = ${id} and not po.is_current`,
    sql`select ep.*, c.full_name, c.relationship_status, c.last_contacted_at, c.do_not_contact from entity_people ep join contacts c on c.id = ep.contact_id where ep.entity_id = ${id} order by ep.is_decision_maker desc nulls last`,
    // Same mailing address or same phone: shown as "possibly related", never auto-merged
    sql`select e2.id, e2.name, e2.entity_type,
               (e2.mailing_normalized = ${e.mailing_normalized}) as same_mailing, (e2.phone = ${e.phone}) as same_phone,
               (select count(*) from property_ownerships x where x.entity_id = e2.id and x.is_current)::int as props
        from entities e2 where e2.org_id = ${s.orgId} and e2.id <> ${id} and (
          (${e.mailing_normalized}::text is not null and ${e.mailing_normalized} <> '|' and e2.mailing_normalized = ${e.mailing_normalized})
          or (${e.phone}::text is not null and e2.phone = ${e.phone} and ${e.phone_shared_count} < 6)
          or (e2.name_normalized = ${e.name_normalized}))
        order by props desc limit 25`,
    timeline(s.orgId, { entityId: id }),
    openTasks(s.orgId, { entityId: id }),
  ]);
  const units = props.reduce((a, p) => a + (p.units ?? 0), 0);
  const assessed = props.reduce((a, p) => a + Number(p.assessed_value ?? 0), 0);

  return (
    <>
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{e.name}</h1>
          <Badge>{label(e.entity_type)}</Badge>
          {e.do_not_contact && <Badge tone="red">Do not contact{e.dnc_reason ? ` · ${e.dnc_reason}` : ""}</Badge>}
          <span className="ml-auto"><DncToggle entityId={id} on={e.do_not_contact} /></span>
        </div>
        <div className="mt-0.5 text-sm text-ink-500">
          {props.length} propert{props.length === 1 ? "y" : "ies"} · {num(units)} units · {money(assessed, { compact: true })} assessed
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Portfolio" />
            <div className="overflow-x-auto">
              <table className="table-compact w-full">
                <thead><tr><th>Property</th><th className="text-right">Units</th><th className="text-right">Built</th><th className="text-right">Assessed</th><th>Acquired</th><th>Vesting</th></tr></thead>
                <tbody>
                  {props.map((p) => (
                    <tr key={p.id}>
                      <td><Link className="font-medium text-navy-800 hover:underline" href={`/properties/${p.id}`}>{p.street_address}</Link> <span className="text-ink-500">{p.city}</span>
                        {p.listing_status !== "none" && <Badge tone="green" className="ml-1">{label(p.listing_status)}</Badge>}</td>
                      <td className="num text-right">{p.units ?? "?"}</td>
                      <td className="num text-right">{p.year_built ?? "—"}</td>
                      <td className="num text-right">{money(p.assessed_value, { compact: true })}</td>
                      <td className="whitespace-nowrap">{date(p.last_sale_date)}</td>
                      <td><Badge tone={p.vesting_role === "owner_of_record" ? "navy" : "gray"}>{label(p.vesting_role)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {past.length > 0 && (
              <div className="border-t border-ink-100 px-4 py-3 text-[13px]">
                <div className="field-label">Previously owned</div>
                {past.map((p) => <div key={p.id}><Link className="hover:underline" href={`/properties/${p.id}`}>{p.street_address}</Link> <span className="text-2xs text-ink-500">{date(p.start_date)} → {date(p.end_date)}</span></div>)}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="People behind this owner" sub="Decision makers, members, trustees — each link carries its evidence" />
            <ul className="divide-y divide-ink-100">
              {people.map((p) => (
                <li key={p.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Link href={`/contacts/${p.contact_id}`} className="font-medium text-navy-800 hover:underline">{p.full_name}</Link>
                    <Badge tone="navy">{label(p.role)}</Badge>
                    {p.ownership_pct && <Badge>{Number(p.ownership_pct)}%</Badge>}
                    {p.is_decision_maker === true && <Badge tone="green">Decision maker</Badge>}
                    {p.is_decision_maker === false && <Badge>Not decision maker</Badge>}
                    <Badge tone={confidenceTone(p.confidence)}>{label(p.confidence)}</Badge>
                    {p.do_not_contact && <Badge tone="red">Do not contact</Badge>}
                    <span className="ml-auto"><Unlink id={p.id} /></span>
                  </div>
                  <div className="text-2xs text-ink-500">Source: {p.source}{p.verified_at ? ` · verified ${date(p.verified_at)}` : ""} · last contact {ago(p.last_contacted_at)}</div>
                </li>
              ))}
            </ul>
            {!people.length && <Empty>No people linked. The owner of record may not be who makes the decision — research before reaching out.</Empty>}
            <div className="space-y-2 border-t border-ink-100 px-4 py-3">
              {e.care_of_name && !people.some((p) => p.role === "in_care_of") && (
                <div className="flex flex-wrap items-center gap-2 text-[13px]">Tax roll lists <b>c/o {e.care_of_name}</b><PromoteCareOf id={id} /></div>
              )}
              <Disclosure label="Link a person"><LinkPersonForm entityId={id} /></Disclosure>
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" sub="Includes activity on this owner's properties and people" />
            <div className="border-b border-ink-100 p-4"><LogActivity links={{ entity_id: id }} /></div>
            <div className="p-4"><Timeline items={acts as unknown as TimelineItem[]} context="entity" /></div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Owner details" />
            <div className="space-y-2 p-4 text-[13px]">
              <div><span className="field-label">Mailing</span>{[e.mailing_address, e.mailing_city, e.mailing_state, e.mailing_zip].filter(Boolean).join(", ") || "—"}</div>
              {e.care_of_name && <div><span className="field-label">In care of</span>{e.care_of_name} <span className="text-2xs text-ink-400">(not assumed to be the owner)</span></div>}
              <div><span className="field-label">Phone</span>{e.phone ?? "—"} {e.phone && <span className="text-2xs text-ink-400">· {e.phone_source}</span>}
                {e.phone_shared_count > 1 && <div className="text-2xs text-amber-700">Same number appears on {e.phone_shared_count + 1} owners: probably a management company, not the owner.</div>}</div>
              {e.notes && <div><span className="field-label">Notes</span><p className="whitespace-pre-wrap">{e.notes}</p></div>}
              <div className="text-2xs text-ink-400">Source: {e.source ?? "—"}</div>
              <Disclosure label="Edit owner"><EntityEditForm e={e as never} /></Disclosure>
            </div>
          </Card>
          <Card>
            <CardHeader title="Tasks" />
            <div className="px-4 py-2"><TaskList tasks={tasks as unknown as TaskRow[]} showLinks /></div>
            <div className="border-t border-ink-100 p-3"><NewTask compact links={{ entity_id: id }} /></div>
          </Card>
          <Card>
            <CardHeader title="Possibly related owners" sub="Same mailing address, phone or name. Not merged; review before treating as one." />
            <ul className="divide-y divide-ink-100">
              {related.map((r) => (
                <li key={r.id} className="px-4 py-2 text-[13px]">
                  <Link href={`/owners/${r.id}`} className="font-medium text-navy-800 hover:underline">{r.name}</Link>
                  <div className="text-2xs text-ink-500">{r.props} props · {[r.same_mailing && "same mailing", r.same_phone && "same phone", !r.same_mailing && !r.same_phone && "same name, different address"].filter(Boolean).join(", ")}</div>
                </li>
              ))}
            </ul>
            {!related.length && <Empty>None found.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
