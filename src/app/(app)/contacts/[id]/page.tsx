import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { openTasks, relationshipStrength, timeline } from "@/lib/queries";
import { Badge, ButtonLink, Card, CardHeader, Empty, confidenceTone } from "@/components/ui";
import { Disclosure } from "@/components/forms";
import { LogActivity, NewTask, TaskList, Timeline, type TaskRow, type TimelineItem } from "@/components/activity";
import { CriteriaForm } from "@/components/buyer-criteria";
import { AddMethod, FlagToggle } from "./client";
import { ago, date, label, money } from "@/lib/utils";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await sql`select c.*, co.name as company_name from contacts c left join companies co on co.id = c.company_id where c.id = ${id} and c.org_id = ${s.orgId}`;
  if (!c) notFound();
  const [cats, phones, emails, entities, props, criteria, opps, acts, tasks, allTouches] = await Promise.all([
    sql`select category from contact_categories where contact_id = ${id}`,
    sql`select * from contact_phones where contact_id = ${id} order by is_primary desc`,
    sql`select * from contact_emails where contact_id = ${id} order by is_primary desc`,
    sql`select ep.*, e.name, e.entity_type,
               (select count(*) from property_ownerships po where po.entity_id = e.id and po.is_current)::int as props,
               (select coalesce(sum(p.units),0) from property_ownerships po join properties p on p.id = po.property_id where po.entity_id = e.id and po.is_current)::int as units
        from entity_people ep join entities e on e.id = ep.entity_id where ep.contact_id = ${id}`,
    sql`select p.id, p.street_address, p.city, p.units, 'via ' || e.name as via
          from entity_people ep join property_ownerships po on po.entity_id = ep.entity_id and po.is_current
          join properties p on p.id = po.property_id join entities e on e.id = ep.entity_id where ep.contact_id = ${id}
        union all
        select p.id, p.street_address, p.city, p.units, pc.role from property_contacts pc join properties p on p.id = pc.property_id where pc.contact_id = ${id}
        order by units desc nulls last limit 100`,
    sql`select * from buyer_criteria where contact_id = ${id} order by is_active desc, created_at`,
    sql`select o.id, o.name, o.expected_price, o.asking_price, s.name as stage,
               case when o.buyer_contact_id = ${id} then 'buyer' else 'seller' end as role
        from opportunities o join pipeline_stages s on s.id = o.stage_id
        where o.seller_contact_id = ${id} or o.buyer_contact_id = ${id} order by o.updated_at desc`,
    timeline(s.orgId, { contactId: id }),
    openTasks(s.orgId, { contactId: id }),
    sql`select type, outcome, occurred_at from activities where contact_id = ${id}`,
  ]);
  const strength = relationshipStrength(allTouches as never);
  const catList = cats.map((x) => x.category as string);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{c.full_name}</h1>
            {c.do_not_contact ? <Badge tone="red">Do not contact</Badge> : <Badge tone={["relationship", "client"].includes(c.relationship_status) ? "green" : "gray"}>{label(c.relationship_status)}</Badge>}
            {catList.map((x) => <Badge key={x}>{label(x)}</Badge>)}
          </div>
          <div className="mt-0.5 text-sm text-ink-500">{[c.title, c.company_name].filter(Boolean).join(" · ") || "—"}</div>
        </div>
        <ButtonLink variant="secondary" href={`/contacts/${id}/edit`}>Edit</ButtonLink>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(entities.length > 0 || props.length > 0) && (
            <Card>
              <CardHeader title="Ownership & properties" />
              {entities.length > 0 && (
                <ul className="divide-y divide-ink-100 border-b border-ink-100">
                  {entities.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
                      <span className="text-ink-500">{label(e.role)} of</span>
                      <Link href={`/owners/${e.entity_id}`} className="font-medium text-navy-800 hover:underline">{e.name}</Link>
                      <span className="text-2xs text-ink-500">{e.props} props · {e.units} units</span>
                      {e.is_decision_maker && <Badge tone="green">Decision maker</Badge>}
                      <Badge tone={confidenceTone(e.confidence)}>{label(e.confidence)}</Badge>
                      <span className="text-2xs text-ink-400">{e.source}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="divide-y divide-ink-100">
                {props.map((p, i) => (
                  <li key={p.id + i} className="flex items-center gap-2 px-4 py-1.5 text-[13px]">
                    <Link href={`/properties/${p.id}`} className="text-navy-800 hover:underline">{p.street_address}</Link>
                    <span className="text-ink-500">{p.city}</span><span className="text-ink-500">{p.units ? `${p.units}u` : ""}</span>
                    <span className="ml-auto text-2xs text-ink-400">{label(p.via)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(catList.includes("investor_buyer") || criteria.length > 0) && (
            <Card>
              <CardHeader title="Acquisition criteria" sub="One buyer can hold several profiles" />
              <div className="divide-y divide-ink-100">
                {criteria.map((cr) => (
                  <div key={cr.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-semibold">{cr.label}</span>
                      {!cr.is_active && <Badge>Inactive</Badge>}
                      {cr.strategy && <Badge tone="navy">{label(cr.strategy)}</Badge>}
                      {cr.is_1031 && <Badge tone="amber">1031{cr.exchange_id_deadline ? ` · ID by ${date(cr.exchange_id_deadline)}` : ""}</Badge>}
                    </div>
                    <div className="mt-1 text-2xs text-ink-600">
                      {[cr.target_markets?.length ? cr.target_markets.join(", ") : "Markets unknown",
                        cr.min_units || cr.max_units ? `${cr.min_units ?? "?"}–${cr.max_units ?? "?"} units` : null,
                        cr.min_price || cr.max_price ? `${money(cr.min_price, { compact: true })}–${money(cr.max_price, { compact: true })}` : null,
                        cr.available_equity ? `${money(cr.available_equity, { compact: true })} equity` : null,
                        cr.target_cap_rate ? `${(cr.target_cap_rate * 100).toFixed(2)}% cap` : null,
                        cr.financing_preference ? label(cr.financing_preference) : null].filter(Boolean).join(" · ")}
                    </div>
                    <Disclosure label="Edit" className="mt-1"><CriteriaForm contactId={id} c={{ ...cr }} /></Disclosure>
                  </div>
                ))}
              </div>
              <div className="border-t border-ink-100 px-4 py-3"><Disclosure label="Add criteria profile" defaultOpen={!criteria.length}><CriteriaForm contactId={id} /></Disclosure></div>
            </Card>
          )}

          <Card>
            <CardHeader title="Relationship timeline" sub="Direct activity plus activity on their entities and deals" />
            <div className="border-b border-ink-100 p-4">
              {c.do_not_contact ? <p className="text-[13px] text-red-700">Marked do-not-contact. You can still log notes.</p> : null}
              <LogActivity links={{ contact_id: id }} />
            </div>
            <div className="p-4"><Timeline items={acts as unknown as TimelineItem[]} context="contact" /></div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Contact" />
            <div className="space-y-3 p-4 text-[13px]">
              <div>
                {phones.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <a href={`tel:${p.phone_digits}`} className={p.do_not_call ? "text-ink-400 line-through" : "text-navy-800 hover:underline"}>{p.phone}</a>
                    <span className="text-2xs text-ink-400">{p.label}</span>{p.do_not_call && <Badge tone="red">DNC</Badge>}
                    <span className="ml-auto"><FlagToggle kind="phone" id={p.id} contactId={id} on={p.do_not_call} /></span>
                  </div>
                ))}
                {emails.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <a href={`mailto:${e.email}`} className={e.opted_out ? "text-ink-400 line-through" : "text-navy-800 hover:underline"}>{e.email}</a>
                    {e.opted_out && <Badge tone="red">Opted out</Badge>}
                    <span className="ml-auto"><FlagToggle kind="email" id={e.id} contactId={id} on={e.opted_out} /></span>
                  </div>
                ))}
                {!phones.length && !emails.length && <span className="text-ink-500">No phone or email.</span>}
                <div className="mt-2"><AddMethod contactId={id} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="field-label">Last contacted</span>{ago(c.last_contacted_at)}</div>
                <div><span className="field-label">Next follow-up</span>{date(c.next_follow_up_at)}</div>
                <div><span className="field-label">Prefers</span>{label(c.preferred_method)}</div>
                <div><span className="field-label">Strength</span>{strength.label} <span className="text-2xs text-ink-400">({strength.score}/100)</span></div>
              </div>
              {c.mailing_address && <div><span className="field-label">Mailing</span>{[c.mailing_address, c.mailing_city, c.mailing_state, c.mailing_zip].filter(Boolean).join(", ")}</div>}
              {c.geographic_focus?.length > 0 && <div><span className="field-label">Focus</span>{c.geographic_focus.join(", ")}</div>}
              {c.relationship_source && <div><span className="field-label">Source</span>{c.relationship_source}</div>}
              {c.personal_notes && <div><span className="field-label">Personal notes</span><p className="whitespace-pre-wrap">{c.personal_notes}</p></div>}
              <p className="text-2xs text-ink-400">Strength is computed from logged touches: recency, conversations and volume.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Tasks" />
            <div className="px-4 py-2"><TaskList tasks={tasks as unknown as TaskRow[]} showLinks={false} /></div>
            <div className="border-t border-ink-100 p-3"><NewTask compact links={{ contact_id: id }} /></div>
          </Card>
          <Card>
            <CardHeader title="Opportunities" />
            <ul className="divide-y divide-ink-100">
              {opps.map((o) => <li key={o.id} className="px-4 py-2"><Link href={`/opportunities/${o.id}`} className="text-[13px] font-medium text-navy-800 hover:underline">{o.name}</Link><div className="text-2xs text-ink-500">{label(o.role)} · {o.stage} · {money(o.expected_price ?? o.asking_price, { compact: true })}</div></li>)}
            </ul>
            {!opps.length && <Empty>None.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
