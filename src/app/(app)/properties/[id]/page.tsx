import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { openTasks, timeline } from "@/lib/queries";
import { Badge, ButtonLink, Card, CardHeader, DL, Empty, confidenceTone } from "@/components/ui";
import { Disclosure } from "@/components/forms";
import { LogActivity, NewTask, TaskList, Timeline, type TaskRow, type TimelineItem } from "@/components/activity";
import { AddCoOwnerForm, ChangeOwnerForm, LinkContactForm, ParcelAdder, RemoveParcel, UnlinkContact } from "./client";
import { PROPERTY_ROLES } from "@/lib/constants";
import { BuyerMatches } from "@/components/buyer-matches";
import { ago, date, label, money, num } from "@/lib/utils";

const FLAG_TEXT: Record<string, string> = {
  units_unknown: "Unit count unknown (source showed 0 or blank)",
  units_outlier: "Unit count in source was implausible and was not imported",
  year_built_invalid: "Year built in source was invalid",
  sale_date_missing: "No usable last-sale date in source",
  construction_type_suspect: "Construction type column contained unexpected data",
  address_range: "Address is a range (multiple buildings or street numbers)",
  missing_zip: "ZIP missing",
  missing_apn: "No APN",
  multi_parcel: "Multiple APNs: the county list repeated this complex's totals on each parcel, so they were merged into one property",
};

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await sql`select * from property_overview where id = ${id} and org_id = ${s.orgId}`;
  if (!p) notFound();

  const [parcels, owners, history, people, contacts, opps, acts, tasks, reviews] = await Promise.all([
    sql`select id, apn from parcels where property_id = ${id} order by apn`,
    sql`select po.*, e.name, e.entity_type, e.care_of_name, e.mailing_address, e.mailing_city, e.mailing_state, e.mailing_zip, e.phone, e.phone_shared_count,
               (select count(*) from property_ownerships x where x.entity_id = e.id and x.is_current)::int as portfolio
        from property_ownerships po join entities e on e.id = po.entity_id
        where po.property_id = ${id} and po.is_current order by (po.vesting_role = 'owner_of_record') desc, po.created_at`,
    sql`select po.*, e.name from property_ownerships po join entities e on e.id = po.entity_id
        where po.property_id = ${id} and not po.is_current order by po.end_date desc nulls last`,
    sql`select ep.*, c.full_name, c.relationship_status, c.last_contacted_at, e.name as entity_name
        from entity_people ep join contacts c on c.id = ep.contact_id join entities e on e.id = ep.entity_id
        where ep.entity_id in (select entity_id from property_ownerships where property_id = ${id} and is_current)
        order by ep.is_decision_maker desc nulls last, ep.role`,
    sql`select pc.*, c.full_name, co.name as company_name from property_contacts pc
        left join contacts c on c.id = pc.contact_id left join companies co on co.id = coalesce(pc.company_id, c.company_id)
        where pc.property_id = ${id} order by pc.created_at`,
    sql`select o.id, o.name, o.expected_price, o.asking_price, s.name as stage, s.kind from opportunities o join pipeline_stages s on s.id = o.stage_id
        where o.property_id = ${id} order by o.created_at desc`,
    timeline(s.orgId, { propertyId: id }),
    openTasks(s.orgId, { propertyId: id }),
    sql`select r.id, e.name from ownership_reviews r join entities e on e.id = r.proposed_entity_id where r.property_id = ${id} and r.status = 'pending'`,
  ]);

  const price = p.asking_price ?? p.estimated_value;
  const flags: string[] = p.data_flags ?? [];
  const primaryOwner = owners.find((o) => o.vesting_role === "owner_of_record");

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{p.street_address}</h1>
            {p.listing_status !== "none" && <Badge tone="green">{label(p.listing_status)}</Badge>}
          </div>
          <div className="mt-0.5 text-sm text-ink-500">
            {[p.city, p.state, p.zip].filter(Boolean).join(", ")}
            {p.units ? ` · ${p.units} units` : " · units unknown"}{p.year_built ? ` · built ${p.year_built}` : ""}
            {p.tenure_years !== null ? ` · owned ${p.tenure_years} yrs` : ""}
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink variant="secondary" href={`/properties/${id}/edit`}>Edit</ButtonLink>
          <ButtonLink href={`/opportunities/new?property_id=${id}${primaryOwner ? `&seller_entity_id=${primaryOwner.entity_id}` : ""}`}>Create opportunity</ButtonLink>
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          A newer import lists <b>{reviews[0].name}</b> as owner. Current owner was kept. <Link href="/data#reviews" className="underline">Review ownership change</Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Property" />
            <div className="p-4">
              <DL items={[
                ["Type", label(p.property_type)], ["Units", p.units ?? "Unknown"], ["Unit mix", p.unit_mix ? (p.unit_mix as { type: string; count: number }[]).map((u) => `${u.count}× ${u.type}`).join(", ") : "—"],
                ["Building SF", num(p.building_sf)], ["Lot SF", num(p.lot_sf)], ["Year built", p.year_built ?? "—"],
                ["Renovated", p.year_renovated ?? "—"], ["Stories", p.floors ?? "—"], ["Construction", label(p.construction_type?.toLowerCase())],
                ["Zoning", p.zoning ?? "—"], ["Parking", p.parking ?? "—"], ["County", p.county ?? "—"],
                ["Assessed (land + impr.)", money(p.assessed_value)], ["Land / Improvements", `${money(p.land_value, { compact: true })} / ${money(p.improvement_value, { compact: true })}`],
                ["Last sale", p.last_sale_date ? `${date(p.last_sale_date)}${p.last_sale_price ? " · " + money(p.last_sale_price) : ""}` : "—"],
                ["Est. market value", p.estimated_value ? <span key="ev">{money(p.estimated_value)} <span className="text-2xs text-ink-400">{p.estimated_value_source}</span></span> : "—"],
                ["Est. debt", p.estimated_debt ? <span key="ed">{money(p.estimated_debt)} <span className="text-2xs text-ink-400">{p.estimated_debt_source}</span></span> : "—"],
                ["Est. equity", p.estimated_value && p.estimated_debt !== null ? money(Number(p.estimated_value) - Number(p.estimated_debt)) : "—"],
              ]} />
              {flags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {flags.map((f) => <Badge key={f} tone="amber" title={f}>{FLAG_TEXT[f.split(":")[0]] ?? f}</Badge>)}
                </div>
              )}
              <p className="mt-3 text-2xs text-ink-400">Source: {p.source ?? "—"}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Ownership" sub="Owner of record ≠ decision maker. Confidence and source shown on every link." />
            <div className="divide-y divide-ink-100">
              {owners.map((o) => (
                <div key={o.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/owners/${o.entity_id}`} className="text-[13px] font-semibold text-navy-800 hover:underline">{o.name}</Link>
                    <Badge>{label(o.entity_type)}</Badge>
                    <Badge tone="navy">{label(o.vesting_role)}</Badge>
                    {o.ownership_pct && <Badge>{Number(o.ownership_pct)}%</Badge>}
                    <Badge tone={confidenceTone(o.confidence)}>{label(o.confidence)}</Badge>
                    {o.portfolio > 1 && <Link href={`/owners/${o.entity_id}`} className="text-2xs text-navy-700 hover:underline">{o.portfolio} properties →</Link>}
                  </div>
                  <div className="mt-1 text-2xs text-ink-500">
                    {[o.mailing_address, o.mailing_city, o.mailing_state, o.mailing_zip].filter(Boolean).join(", ") || "No mailing address"}
                    {o.care_of_name && <> · c/o {o.care_of_name}</>}
                    {o.phone && <> · {o.phone}{o.phone_shared_count > 1 && <span className="text-amber-700"> (shared by {o.phone_shared_count + 1} owners — likely a manager)</span>}</>}
                  </div>
                  <div className="text-2xs text-ink-400">Since {o.start_date ? date(o.start_date) : "unknown"} · source: {o.source}</div>
                </div>
              ))}
              {!owners.length && <Empty>No owner on record.</Empty>}
            </div>
            {people.length > 0 && (
              <div className="border-t border-ink-100 px-4 py-3">
                <div className="field-label">People behind the owner</div>
                <ul className="space-y-1.5">
                  {people.map((pp) => (
                    <li key={pp.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Link href={`/contacts/${pp.contact_id}`} className="font-medium text-navy-800 hover:underline">{pp.full_name}</Link>
                      <span className="text-ink-500">{label(pp.role)} of {pp.entity_name}</span>
                      {pp.is_decision_maker && <Badge tone="green">Decision maker</Badge>}
                      <Badge tone={confidenceTone(pp.confidence)}>{label(pp.confidence)}</Badge>
                      <span className="text-2xs text-ink-400">last contact {ago(pp.last_contacted_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {history.length > 0 && (
              <div className="border-t border-ink-100 px-4 py-3">
                <div className="field-label">Ownership history</div>
                {history.map((h) => (
                  <div key={h.id} className="text-[13px] text-ink-700">
                    <Link href={`/owners/${h.entity_id}`} className="hover:underline">{h.name}</Link>
                    <span className="text-2xs text-ink-500"> · {h.start_date ? date(h.start_date) : "?"} → {h.end_date ? date(h.end_date) : "?"} · {h.source}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 border-t border-ink-100 px-4 py-3">
              <Disclosure label="Record an ownership change"><ChangeOwnerForm propertyId={id} /></Disclosure>
              <Disclosure label="Add co-owner"><AddCoOwnerForm propertyId={id} /></Disclosure>
            </div>
          </Card>

          <Card>
            <CardHeader title="Contacts on this property" sub="Property managers, owner reps, on-site staff" action={<ButtonLink size="sm" variant="secondary" href={`/contacts/new?link_property_id=${id}`}>New contact</ButtonLink>} />
            <ul className="divide-y divide-ink-100">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                  {c.contact_id ? <Link href={`/contacts/${c.contact_id}`} className="font-medium text-navy-800 hover:underline">{c.full_name}</Link> : <span className="font-medium">{c.company_name}</span>}
                  <span className="text-ink-500">{PROPERTY_ROLES.find(([v]) => v === c.role)?.[1] ?? label(c.role)}</span>
                  {c.company_name && c.contact_id && <span className="text-2xs text-ink-400">{c.company_name}</span>}
                  <span className="ml-auto"><UnlinkContact id={c.id} /></span>
                </li>
              ))}
            </ul>
            <div className="border-t border-ink-100 px-4 py-3"><LinkContactForm propertyId={id} /></div>
          </Card>

          <BuyerMatches orgId={s.orgId} propertyId={id} opportunityId={opps.find((o) => o.kind === "open" || o.kind === "under_contract")?.id ?? null} address={p.street_address} />

          <Card>
            <CardHeader title="Activity" sub="Includes activity logged on this property's owners and deals" />
            <div className="border-b border-ink-100 p-4">
              <LogActivity links={{ property_id: id, entity_id: primaryOwner?.entity_id }} />
            </div>
            <div className="p-4"><Timeline items={acts as unknown as TimelineItem[]} context="property" /></div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Tasks" />
            <div className="px-4 py-2"><TaskList tasks={tasks as unknown as TaskRow[]} showLinks={false} /></div>
            <div className="border-t border-ink-100 p-3"><NewTask compact links={{ property_id: id, entity_id: primaryOwner?.entity_id }} /></div>
          </Card>

          <Card>
            <CardHeader title="Opportunities" />
            <ul className="divide-y divide-ink-100">
              {opps.map((o) => (
                <li key={o.id} className="px-4 py-2">
                  <Link href={`/opportunities/${o.id}`} className="text-[13px] font-medium text-navy-800 hover:underline">{o.name}</Link>
                  <div className="text-2xs text-ink-500">{o.stage} · {money(o.expected_price ?? o.asking_price, { compact: true })}</div>
                </li>
              ))}
            </ul>
            {!opps.length && <Empty>None yet.</Empty>}
          </Card>

          <Card>
            <CardHeader title="Investment snapshot" sub="Calculated only from data entered on this property" />
            <div className="p-4">
              <DL items={[
                ["Asking", money(p.asking_price)], ["Current NOI", money(p.current_noi)], ["Stabilized NOI", money(p.stabilized_noi)],
                ["Going-in cap", p.current_noi && price ? `${((Number(p.current_noi) / Number(price)) * 100).toFixed(2)}%` : "—"],
                ["$ / unit", price && p.units ? money(Number(price) / p.units) : "—"],
                ["$ / SF", price && p.building_sf ? money(Number(price) / p.building_sf) : "—"],
              ]} />
              <p className="mt-3 text-2xs text-ink-400">Underwriting module connects here in Phase 4 (results save back to these fields).</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Parcels (APNs)" />
            <ul className="px-4 py-2">
              {parcels.map((pc) => <li key={pc.id} className="flex items-center justify-between font-mono text-xs">{pc.apn}<RemoveParcel id={pc.id} /></li>)}
              {!parcels.length && <li className="text-[13px] text-ink-500">No APN on file.</li>}
            </ul>
            <div className="border-t border-ink-100 p-3"><ParcelAdder propertyId={id} /></div>
          </Card>

          {p.notes && (
            <Card><CardHeader title="Notes" /><p className="whitespace-pre-wrap p-4 text-[13px]">{p.notes}</p></Card>
          )}
          <p className="text-2xs text-ink-400">Added {date(p.created_at)} · updated {ago(p.updated_at)}</p>
        </div>
      </div>
    </>
  );
}
