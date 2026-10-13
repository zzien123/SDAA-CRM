import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { timeline } from "@/lib/queries";
import { ownerRows, queueOrder, STATUS_LABEL } from "@/lib/prospecting";
import { Badge, ButtonLink, Card, CardHeader, Empty, confidenceTone } from "@/components/ui";
import { Timeline, type TimelineItem } from "@/components/activity";
import { DncToggle, ListAdmin, OutcomeForm, OwnerControls } from "../client";
import { ago, cn, date, label, money, num, qs, today } from "@/lib/utils";

const PAGE = 50;
const STATUS_TONE: Record<string, "gray" | "navy" | "green" | "amber" | "red"> = {
  queued: "gray", attempting: "gray", connected: "navy", interested: "green", converted: "green", not_interested: "amber", do_not_contact: "red", skipped: "gray",
};

export default async function ListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ owner?: string; tab?: string; status?: string; page?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [list] = await sql`select * from prospect_lists where id = ${id} and org_id = ${s.orgId}`;
  if (!list) notFound();
  const t = today();
  const owners = ownerRows(s.orgId, id);
  const workable = sql`not suppressed and (status = 'queued' or (status in ('attempting','connected','interested','not_interested') and next_action_date <= ${t}))`;

  const [stats, [counts]] = await Promise.all([
    sql`select status, count(*)::int as n from (${owners}) o group by status`,
    sql`select count(*)::int as owners, coalesce(sum(props),0)::int as props, coalesce(sum(units),0)::int as units,
               count(*) filter (where ${workable})::int as workable,
               count(*) filter (where suppressed)::int as suppressed from (${owners}) o`,
  ]);
  const byStatus = Object.fromEntries(stats.map((r) => [r.status, r.n]));
  const tab = sp.tab === "all" ? "all" : "queue";

  // ---------- All owners table
  if (tab === "all") {
    const page = Math.max(1, Number(sp.page ?? 1) || 1);
    const filter = sp.status ? sql`where status = ${sp.status}` : sql``;
    const rows = await sql`select * from (${owners}) o ${filter} ${queueOrder(t)} limit ${PAGE} offset ${(page - 1) * PAGE}`;
    const [{ n }] = await sql`select count(*)::int as n from (${owners}) o ${filter}`;
    return (
      <>
        <Header list={list} counts={counts} byStatus={byStatus} tab={tab} />
        <div className="mb-3 flex flex-wrap gap-1">
          <Link href={`/prospecting/${id}?tab=all`} className={cn("rounded-md px-2.5 py-1 text-xs", !sp.status ? "bg-navy-900 text-white" : "text-ink-700 hover:bg-ink-100")}>All</Link>
          {Object.keys(STATUS_LABEL).filter((k) => byStatus[k]).map((k) => (
            <Link key={k} href={`/prospecting/${id}?tab=all&status=${k}`} className={cn("rounded-md px-2.5 py-1 text-xs", sp.status === k ? "bg-navy-900 text-white" : "text-ink-700 hover:bg-ink-100")}>{STATUS_LABEL[k]} ({byStatus[k]})</Link>
          ))}
        </div>
        <Card className="overflow-x-auto">
          <table className="table-compact w-full">
            <thead><tr><th>Owner</th><th>Status</th><th className="text-right">Props</th><th className="text-right">Units</th><th>Largest property</th><th className="text-right">Attempts</th><th>Last touch</th><th>Next</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entity_id}>
                  <td><Link href={`/prospecting/${id}?owner=${r.entity_id}`} className="font-medium text-navy-800 hover:underline">{r.name}</Link>
                    <span className="ml-1 text-2xs text-ink-400">{label(r.entity_type)}</span>{r.suppressed && <Badge tone="red" className="ml-1">DNC</Badge>}</td>
                  <td><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                  <td className="num text-right">{r.props}</td>
                  <td className="num text-right">{num(r.units)}</td>
                  <td>{r.top_address}</td>
                  <td className="num text-right">{r.attempts}</td>
                  <td className="whitespace-nowrap text-ink-500">{r.last_attempt_at ? ago(r.last_attempt_at) : "—"}</td>
                  <td className={cn("whitespace-nowrap", r.next_action_date && r.next_action_date <= t ? "font-medium text-red-700" : "")}>{date(r.next_action_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty>None.</Empty>}
        </Card>
        {n > PAGE && (
          <div className="mt-3 flex justify-end gap-2">
            {page > 1 && <ButtonLink size="sm" variant="secondary" href={`/prospecting/${id}${qs({ tab: "all", status: sp.status }, { page: String(page - 1) })}`}>Previous</ButtonLink>}
            {page * PAGE < n && <ButtonLink size="sm" variant="secondary" href={`/prospecting/${id}${qs({ tab: "all", status: sp.status }, { page: String(page + 1) })}`}>Next</ButtonLink>}
          </div>
        )}
      </>
    );
  }

  // ---------- Queue
  const ownerId = sp.owner && /^[0-9a-f-]{36}$/.test(sp.owner) ? sp.owner : null;
  const [current] = ownerId
    ? await sql`select * from (${owners}) o where entity_id = ${ownerId}`
    : await sql`select * from (${owners}) o where ${workable} ${queueOrder(t)} limit 1`;
  const upcoming = await sql`select * from (${owners}) o where ${workable} and entity_id is distinct from ${current?.entity_id ?? null} ${queueOrder(t)} limit 12`;

  if (!current) {
    return (
      <>
        <Header list={list} counts={counts} byStatus={byStatus} tab={tab} />
        <Card className="p-8 text-center text-[13px] text-ink-600">
          Nothing due on this list today. {counts.owners - counts.workable - counts.suppressed > 0 && "Every owner is either waiting on a follow-up date or closed out."}
          <div className="mt-3"><ButtonLink variant="secondary" href={`/prospecting/${id}?tab=all`}>See all owners</ButtonLink></div>
        </Card>
      </>
    );
  }

  const e = current.entity_id as string;
  const [[ent], props, otherProps, people, acts, opps] = await Promise.all([
    sql`select e.*, ec.owner_suppressed, ec.phone_suppressed, ec.mail_suppressed from entities e join entity_contactability ec on ec.entity_id = e.id where e.id = ${e}`,
    sql`select i.id as item_id, p.id, p.street_address, p.city, p.zip, p.units, p.year_built, p.assessed_value, p.last_sale_date,
               (select string_agg(apn, ', ') from parcels where property_id = p.id) as apns
        from prospect_list_items i join properties p on p.id = i.property_id where i.list_id = ${id} and i.entity_id = ${e} order by p.units desc nulls last`,
    sql`select count(*)::int as n, coalesce(sum(p.units),0)::int as units from property_ownerships po join properties p on p.id = po.property_id
        where po.entity_id = ${e} and po.is_current and not exists (select 1 from prospect_list_items i where i.list_id = ${id} and i.property_id = p.id)`,
    sql`select ep.role, ep.is_decision_maker, ep.confidence, c.id, c.full_name, c.do_not_contact,
               (select json_agg(json_build_object('phone', phone, 'digits', phone_digits, 'dnc', do_not_call or exists (
                   select 1 from suppressions s where s.org_id = ${s.orgId} and s.kind = 'phone' and s.value = cp.phone_digits)))
                  from contact_phones cp where cp.contact_id = c.id) as phones,
               (select json_agg(json_build_object('email', email, 'opted_out', opted_out)) from contact_emails ce where ce.contact_id = c.id) as emails
        from entity_people ep join contacts c on c.id = ep.contact_id where ep.entity_id = ${e} order by ep.is_decision_maker desc nulls last`,
    timeline(s.orgId, { entityId: e }, 8),
    sql`select o.id, o.name, st.name as stage from opportunities o join pipeline_stages st on st.id = o.stage_id where o.seller_entity_id = ${e} and st.kind in ('open','under_contract')`,
  ]);
  const units = props.reduce((a, p) => a + (p.units ?? 0), 0);
  const oldest = props.map((p) => p.last_sale_date).filter(Boolean).sort()[0];
  const tenure = oldest ? Math.floor((Date.now() - new Date(oldest + "T12:00:00").getTime()) / (365.25 * 86400000)) : null;

  return (
    <>
      <Header list={list} counts={counts} byStatus={byStatus} tab={tab} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/owners/${e}`} className="text-lg font-semibold text-navy-900 hover:underline">{ent.name}</Link>
                  <Badge>{label(ent.entity_type)}</Badge>
                  <Badge tone={STATUS_TONE[current.status]}>{STATUS_LABEL[current.status]}</Badge>
                  {ent.owner_suppressed && <Badge tone="red">Do not contact</Badge>}
                </div>
                <div className="mt-0.5 text-[13px] text-ink-600">
                  {props.length} propert{props.length === 1 ? "y" : "ies"} on this list · {num(units)} units{tenure !== null ? ` · held ${tenure}+ yrs` : ""}
                  {otherProps[0].n > 0 && <> · <Link href={`/owners/${e}`} className="text-navy-700 hover:underline">+{otherProps[0].n} more owned ({num(otherProps[0].units)} units)</Link></>}
                </div>
                <div className="text-2xs text-ink-500">Attempts {current.attempts}{current.last_attempt_at ? ` · last ${ago(current.last_attempt_at)}` : ""}{current.next_action_date ? ` · due ${date(current.next_action_date)}` : ""}</div>
              </div>
              <OwnerControls listId={id} entityId={e} priority={current.priority} />
            </div>

            <div className="grid gap-4 px-4 py-3 md:grid-cols-2">
              <div className="text-[13px]">
                <div className="field-label">Reach the owner</div>
                {ent.phone ? (
                  ent.phone_suppressed ? <div className="text-ink-400 line-through">{ent.phone} <span className="no-underline">suppressed</span></div>
                    : <div><a href={`tel:${ent.phone.replace(/\D/g, "")}`} className="font-medium text-navy-800 hover:underline">{ent.phone}</a>
                        <span className="text-2xs text-ink-400"> · tax roll, unverified</span>
                        {ent.phone_shared_count > 1 && <div className="text-2xs text-amber-700">Shared by {ent.phone_shared_count + 1} owners — likely a property manager. Ask who handles ownership decisions.</div>}</div>
                ) : <div className="text-ink-500">No phone on file</div>}
                <div className="mt-1.5">{[ent.mailing_address, ent.mailing_city, ent.mailing_state, ent.mailing_zip].filter(Boolean).join(", ") || "No mailing address"}
                  {ent.mail_suppressed && <Badge tone="red" className="ml-1">mail suppressed</Badge>}</div>
                {ent.care_of_name && <div className="text-2xs text-ink-500">c/o {ent.care_of_name}</div>}
              </div>
              <div className="text-[13px]">
                <div className="field-label">People behind the owner</div>
                {people.map((p) => (
                  <div key={p.id} className="mb-1.5">
                    <Link href={`/contacts/${p.id}`} className="font-medium text-navy-800 hover:underline">{p.full_name}</Link>
                    <span className="text-2xs text-ink-500"> · {label(p.role)}</span>
                    {p.is_decision_maker && <Badge tone="green" className="ml-1">Decision maker</Badge>}
                    <Badge tone={confidenceTone(p.confidence)} className="ml-1">{label(p.confidence)}</Badge>
                    {p.do_not_contact && <Badge tone="red" className="ml-1">DNC</Badge>}
                    <div className="text-2xs">
                      {(p.phones ?? []).map((ph: { phone: string; digits: string; dnc: boolean }) => ph.dnc
                        ? <span key={ph.digits} className="mr-2 text-ink-400 line-through">{ph.phone}</span>
                        : <a key={ph.digits} href={`tel:${ph.digits}`} className="mr-2 text-navy-700 hover:underline">{ph.phone}</a>)}
                      {(p.emails ?? []).map((em: { email: string; opted_out: boolean }) => <span key={em.email} className={cn("mr-2", em.opted_out && "text-ink-400 line-through")}>{em.email}</span>)}
                    </div>
                  </div>
                ))}
                {!people.length && <div className="text-ink-500">None linked. <Link href={`/owners/${e}`} className="text-navy-700 hover:underline">Research &amp; link the decision maker</Link></div>}
              </div>
            </div>

            <div className="border-t border-ink-100">
              <table className="table-compact w-full">
                <thead><tr><th>Property</th><th className="text-right">Units</th><th className="text-right">Built</th><th className="text-right">Assessed</th><th>Acquired</th><th>APN</th></tr></thead>
                <tbody>
                  {props.map((p) => (
                    <tr key={p.id}>
                      <td><Link href={`/properties/${p.id}`} className="text-navy-800 hover:underline">{p.street_address}</Link> <span className="text-ink-500">{p.city}</span></td>
                      <td className="num text-right">{p.units ?? "?"}</td>
                      <td className="num text-right">{p.year_built ?? "—"}</td>
                      <td className="num text-right">{money(p.assessed_value, { compact: true })}</td>
                      <td className="whitespace-nowrap">{date(p.last_sale_date)}</td>
                      <td className="font-mono text-2xs text-ink-500">{p.apns}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Log this touch" sub="Applies to every property this owner has on the list"
              action={opps.length ? <Link href={`/opportunities/${opps[0].id}`} className="text-xs text-navy-700 hover:underline">Open deal: {opps[0].stage}</Link>
                : <ButtonLink size="sm" variant="secondary" href={`/opportunities/new?property_id=${props[0].id}&seller_entity_id=${e}&prospect_list_id=${id}`}>Create opportunity</ButtonLink>} />
            <div className="p-4">
              {ent.owner_suppressed
                ? <p className="text-[13px] text-red-700">This owner is marked do-not-contact{ent.dnc_reason ? ` (${ent.dnc_reason})` : ""}. Outreach is blocked.</p>
                : <OutcomeForm listId={id} entityId={e} people={people.filter((p) => !p.do_not_contact).map((p) => ({ id: p.id, name: p.full_name }))} />}
              <div className="mt-3 border-t border-ink-100 pt-3"><DncToggle entityId={e} on={ent.do_not_contact} /></div>
            </div>
          </Card>

          <Card>
            <CardHeader title="History with this owner" />
            <div className="p-4"><Timeline items={acts as unknown as TimelineItem[]} context="entity" /></div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Up next" sub={`${num(counts.workable)} owners workable today`} />
          <ul className="divide-y divide-ink-100">
            {upcoming.map((u) => (
              <li key={u.entity_id}>
                <Link href={`/prospecting/${id}?owner=${u.entity_id}`} className="block px-4 py-2 hover:bg-ink-50">
                  <div className="text-[13px] font-medium text-ink-900">{u.name}</div>
                  <div className="text-2xs text-ink-500">{u.props} prop · {num(u.units)} units · {STATUS_LABEL[u.status]}{u.next_action_date ? ` · due ${date(u.next_action_date)}` : ""}</div>
                </Link>
              </li>
            ))}
          </ul>
          {!upcoming.length && <Empty>Nothing else due.</Empty>}
        </Card>
      </div>
    </>
  );
}

function Header({ list, counts, byStatus, tab }: { list: Record<string, unknown>; counts: Record<string, number>; byStatus: Record<string, number>; tab: string }) {
  const id = list.id as string;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/prospecting" className="text-2xs text-ink-500 hover:underline">← Prospecting</Link>
          <h1 className="text-xl font-semibold tracking-tight">{list.name as string}</h1>
          <div className="text-sm text-ink-500">{num(counts.owners)} owners · {num(counts.props)} properties · {num(counts.units)} units{counts.suppressed ? ` · ${counts.suppressed} suppressed` : ""}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink size="sm" variant="secondary" href={`/api/export/prospect-list/${id}?format=mail`}>Export mail list</ButtonLink>
          <ButtonLink size="sm" variant="secondary" href={`/api/export/prospect-list/${id}?format=calls`}>Export call sheet</ButtonLink>
          <ListAdmin id={id} archived={list.is_archived as boolean} />
        </div>
      </div>
      <Card className="mb-4 grid grid-cols-3 divide-x divide-ink-100 sm:grid-cols-6">
        {[["Not contacted", byStatus.queued], ["Attempting", byStatus.attempting], ["Connected", byStatus.connected], ["Interested", byStatus.interested], ["Deals", byStatus.converted], ["Not interested", byStatus.not_interested]].map(([l, n]) => (
          <div key={l as string} className="px-3 py-2"><div className="text-2xs uppercase tracking-wide text-ink-500">{l}</div><div className="num text-lg font-semibold">{num((n as number) ?? 0)}</div></div>
        ))}
      </Card>
      <div className="mb-4 flex gap-5 border-b border-ink-200">
        <Link href={`/prospecting/${id}`} className={cn("border-b-2 px-1 pb-2 text-sm", tab === "queue" ? "border-navy-900 font-medium" : "border-transparent text-ink-500")}>Work the queue</Link>
        <Link href={`/prospecting/${id}?tab=all`} className={cn("border-b-2 px-1 pb-2 text-sm", tab === "all" ? "border-navy-900 font-medium" : "border-transparent text-ink-500")}>All owners</Link>
      </div>
    </>
  );
}
