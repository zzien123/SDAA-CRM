import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { commissionSql, orgSettings } from "@/lib/queries";
import { Badge, Card, CardHeader, Empty, Stat } from "@/components/ui";
import { TaskList, Timeline, type TaskRow, type TimelineItem } from "@/components/activity";
import { ago, cn, date, money, num, today } from "@/lib/utils";

const FEEDS = { all: "All", conversations: "Conversations", outreach: "Outreach", deals: "Deal changes" } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ feed?: keyof typeof FEEDS }> }) {
  const s = await requireSession();
  const { feed = "all" } = await searchParams;
  const d = await orgSettings(s.orgId);
  const t = today();
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const comm = commissionSql(d.default_commission_rate, d.default_brokerage_split);

  const feedFilter = feed === "conversations" ? sql`and a.outcome in ('conversation','meaningful_conversation','open_to_selling','meeting_set')`
    : feed === "outreach" ? sql`and a.type in ('call','email','text','letter','meeting','in_person')`
    : feed === "deals" ? sql`and a.opportunity_id is not null` : sql``;

  const [[k], [pipe], ownerTasks, ownerFollowups, buyerFollowups, exchanges, negotiations, attention, openToSell, newOpps, reviews, recentConvos, feedItems, pools] = await Promise.all([
    sql`select
          (select count(*) from properties where org_id = ${s.orgId})::int as properties,
          (select count(distinct po.entity_id) from property_ownerships po where po.org_id = ${s.orgId} and po.is_current)::int as owners,
          (select count(distinct contact_id) from buyer_criteria where org_id = ${s.orgId} and is_active)::int as buyers,
          (select count(*) from properties where org_id = ${s.orgId} and listing_status = 'active_listing')::int as listings,
          (select count(*) from properties where org_id = ${s.orgId} and listing_status = 'off_market_opportunity')::int as off_market,
          (select count(*) from tasks where org_id = ${s.orgId} and status = 'open' and due_date < ${t})::int as overdue,
          (select count(*) from tasks where org_id = ${s.orgId} and status = 'open' and due_date between ${t} and ${in7})::int as upcoming`,
    sql`select count(*) filter (where st.kind = 'under_contract')::int as transactions,
               count(*)::int as open_deals,
               coalesce(sum(coalesce(o.expected_price, o.asking_price, 0)),0) as gross,
               coalesce(sum(${comm}),0) as commission,
               coalesce(sum(${comm} * coalesce(o.probability, st.default_probability) / 100),0) as weighted
        from opportunities o join pipeline_stages st on st.id = o.stage_id
        where o.org_id = ${s.orgId} and st.kind in ('open','under_contract')`,
    // 1. Owners to contact today
    sql`select t.*, p.street_address, c.full_name as contact_name, e.name as entity_name, o.name as opp_name
        from tasks t left join properties p on p.id = t.property_id left join contacts c on c.id = t.contact_id
        left join entities e on e.id = t.entity_id left join opportunities o on o.id = t.opportunity_id
        where t.org_id = ${s.orgId} and t.status = 'open' and t.due_date <= ${t}
          and (t.type = 'call_owner' or t.entity_id is not null
               or exists (select 1 from contact_categories cc where cc.contact_id = t.contact_id and cc.category in ('property_owner','seller')))
        order by t.due_date, t.priority limit 10`,
    sql`select c.id, c.full_name, c.next_follow_up_at, c.last_contacted_at from contacts c
        where c.org_id = ${s.orgId} and not c.do_not_contact and c.next_follow_up_at <= ${t}
          and exists (select 1 from contact_categories cc where cc.contact_id = c.id and cc.category in ('property_owner','seller'))
          and not exists (select 1 from tasks t where t.contact_id = c.id and t.status = 'open' and t.due_date <= ${t})
        order by c.next_follow_up_at limit 10`,
    // 2. Buyers requiring follow-up
    sql`select c.id, c.full_name, c.next_follow_up_at, c.last_contacted_at, count(b.*)::int as profiles
        from contacts c join buyer_criteria b on b.contact_id = c.id and b.is_active
        where c.org_id = ${s.orgId} and not c.do_not_contact
          and (c.next_follow_up_at <= ${t} or c.last_contacted_at is null or c.last_contacted_at < now() - interval '60 days')
        group by c.id order by c.next_follow_up_at nulls last, c.last_contacted_at nulls first limit 8`,
    sql`select b.id, b.label, b.exchange_id_deadline, b.exchange_close_deadline, c.id as contact_id, c.full_name
        from buyer_criteria b join contacts c on c.id = b.contact_id
        where b.org_id = ${s.orgId} and b.is_active and b.is_1031 and b.exchange_id_deadline between ${t} and ${in30}
        order by b.exchange_id_deadline`,
    // 3. Active negotiations: open stages at ≥50% default probability, plus under contract
    sql`select o.id, o.name, st.name as stage, o.expected_price, o.asking_price, o.next_action, o.next_action_date, ${comm} as commission
        from opportunities o join pipeline_stages st on st.id = o.stage_id
        where o.org_id = ${s.orgId} and ((st.kind = 'open' and st.default_probability >= 50) or st.kind = 'under_contract')
        order by st.position desc, o.expected_close_date nulls last limit 10`,
    // 4. Deals requiring attention
    sql`select o.id, o.name, st.name as stage,
               case when o.next_action_date < ${t} then 'Next action overdue (' || to_char(o.next_action_date, 'Mon DD') || ')'
                    when o.expected_close_date < ${t} then 'Expected close date has passed'
                    when o.next_action is null then 'No next action set'
                    else 'No activity in 14+ days' end as reason
        from opportunities o join pipeline_stages st on st.id = o.stage_id
        where o.org_id = ${s.orgId} and st.kind in ('open','under_contract') and (
          o.next_action_date < ${t} or o.expected_close_date < ${t} or o.next_action is null
          or coalesce((select max(occurred_at) from activities a where a.opportunity_id = o.id), o.created_at) < now() - interval '14 days')
        order by o.next_action_date nulls last limit 10`,
    // 5. New opportunities worth reviewing (all from logged data)
    sql`select distinct on (coalesce(a.property_id, a.entity_id, a.contact_id)) a.id, a.occurred_at, a.body, a.property_id, p.street_address,
               a.entity_id, e.name as entity_name, a.contact_id, c.full_name as contact_name
        from activities a left join properties p on p.id = a.property_id left join entities e on e.id = a.entity_id left join contacts c on c.id = a.contact_id
        where a.org_id = ${s.orgId} and a.outcome = 'open_to_selling' and a.occurred_at > now() - interval '120 days'
          and not exists (select 1 from opportunities o join pipeline_stages st on st.id = o.stage_id
                          where st.kind in ('open','under_contract') and (o.property_id = a.property_id or o.seller_entity_id = a.entity_id or o.seller_contact_id = a.contact_id))
        order by coalesce(a.property_id, a.entity_id, a.contact_id), a.occurred_at desc limit 8`,
    sql`select o.id, o.name, st.name as stage, o.created_at from opportunities o join pipeline_stages st on st.id = o.stage_id
        where o.org_id = ${s.orgId} and o.created_at > now() - interval '14 days' and st.kind = 'open' order by o.created_at desc limit 6`,
    sql`select count(*)::int as n from ownership_reviews where org_id = ${s.orgId} and status = 'pending'`,
    sql`select a.*, p.street_address, c.full_name as contact_name, e.name as entity_name, o.name as opp_name, null as author
        from activities a left join properties p on p.id = a.property_id left join contacts c on c.id = a.contact_id
        left join entities e on e.id = a.entity_id left join opportunities o on o.id = a.opportunity_id
        where a.org_id = ${s.orgId} and a.outcome in ('conversation','meaningful_conversation','open_to_selling','meeting_set')
          and (a.entity_id is not null or exists (select 1 from contact_categories cc where cc.contact_id = a.contact_id and cc.category in ('property_owner','seller')))
        order by a.occurred_at desc limit 6`,
    sql`select a.*, p.street_address, c.full_name as contact_name, e.name as entity_name, o.name as opp_name, null as author
        from activities a left join properties p on p.id = a.property_id left join contacts c on c.id = a.contact_id
        left join entities e on e.id = a.entity_id left join opportunities o on o.id = a.opportunity_id
        where a.org_id = ${s.orgId} and not a.is_private ${feedFilter} order by a.occurred_at desc limit 12`,
    // Prospect pools: factual counts from the property database, each links to the filtered list
    sql`select
          count(*) filter (where units >= 10 and last_sale_date <= current_date - interval '20 years' and last_outreach_at is null)::int as long_hold_10,
          count(*) filter (where units between 5 and 30 and owner_type in ('individual','trust') and last_sale_date <= current_date - interval '25 years')::int as legacy_5_30,
          count(*) filter (where units >= 5 and owner_out_of_state)::int as oos_5,
          count(*) filter (where units >= 5 and (last_outreach_at is null or last_outreach_at < now() - interval '180 days'))::int as stale_5
        from property_overview where org_id = ${s.orgId}`,
  ]);

  const p = pools[0];
  const actionCount = ownerTasks.length + ownerFollowups.length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Good {Number(new Date().toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Los_Angeles" })) < 12 ? "morning" : "afternoon"}</h1>
          <p className="text-sm text-ink-500">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" })}</p>
        </div>
      </div>

      <Card className="mb-4 grid grid-cols-2 divide-ink-100 sm:grid-cols-4 lg:grid-cols-8 [&>*]:border-b [&>*]:border-r [&>*]:border-ink-100">
        <Stat label="Pipeline (gross)" value={money(pipe.gross, { compact: true })} sub={`${pipe.open_deals} open deals`} href="/opportunities" />
        <Stat label="Potential commission" value={money(pipe.commission, { compact: true })} sub="your share" href="/opportunities" />
        <Stat label="Weighted commission" value={money(pipe.weighted, { compact: true })} sub="× probability" href="/opportunities" />
        <Stat label="In escrow" value={pipe.transactions} sub="active transactions" href="/opportunities" />
        <Stat label="Active listings" value={k.listings} href="/properties?status=active_listing" />
        <Stat label="Off-market opps" value={k.off_market} href="/properties?status=off_market_opportunity" />
        <Stat label="Active buyers" value={k.buyers} href="/buyers" />
        <Stat label="Tasks" value={<span className={k.overdue ? "text-red-700" : ""}>{k.overdue} overdue</span>} sub={`${k.upcoming} due next 7 days`} href="/tasks" />
      </Card>

      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-500">Today’s action center</h2>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={`1 · Owners to contact today${actionCount ? ` (${actionCount})` : ""}`} />
          <div className="px-4 py-1"><TaskList tasks={ownerTasks as unknown as TaskRow[]} /></div>
          {ownerFollowups.length > 0 && (
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {ownerFollowups.map((c) => (
                <li key={c.id} className="px-4 py-2 text-[13px]"><Link href={`/contacts/${c.id}`} className="font-medium text-navy-800 hover:underline">{c.full_name}</Link>
                  <span className="text-2xs text-ink-500"> · follow-up {date(c.next_follow_up_at)} · last {ago(c.last_contacted_at)}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="2 · Buyers requiring follow-up" />
          {exchanges.length > 0 && (
            <ul className="border-b border-ink-100 bg-amber-50/50">
              {exchanges.map((x) => (
                <li key={x.id} className="px-4 py-2 text-[13px]"><Badge tone="amber">1031</Badge> <Link href={`/contacts/${x.contact_id}`} className="font-medium text-navy-800 hover:underline">{x.full_name}</Link>
                  <span className="text-2xs text-ink-600"> · ID deadline {date(x.exchange_id_deadline)}</span></li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-ink-100">
            {buyerFollowups.map((b) => (
              <li key={b.id} className="px-4 py-2 text-[13px]"><Link href={`/contacts/${b.id}`} className="font-medium text-navy-800 hover:underline">{b.full_name}</Link>
                <span className="text-2xs text-ink-500"> · {b.next_follow_up_at && b.next_follow_up_at <= t ? `follow-up ${date(b.next_follow_up_at)}` : `last contact ${ago(b.last_contacted_at)}`}</span></li>
            ))}
          </ul>
          {!buyerFollowups.length && !exchanges.length && <Empty>No buyers due. Add buyer criteria to start tracking.</Empty>}
        </Card>
        <Card>
          <CardHeader title="3 · Active negotiations" />
          <ul className="divide-y divide-ink-100">
            {negotiations.map((o) => (
              <li key={o.id} className="px-4 py-2 text-[13px]"><Link href={`/opportunities/${o.id}`} className="font-medium text-navy-800 hover:underline">{o.name}</Link>
                <div className="text-2xs text-ink-500">{o.stage} · {money(o.expected_price ?? o.asking_price, { compact: true })} · {money(o.commission, { compact: true })} comm.{o.next_action ? ` · next: ${o.next_action}` : ""}</div></li>
            ))}
          </ul>
          {!negotiations.length && <Empty>No deals at offer stage or later.</Empty>}
        </Card>
        <Card>
          <CardHeader title="4 · Deals requiring attention" />
          <ul className="divide-y divide-ink-100">
            {attention.map((o) => (
              <li key={o.id} className="px-4 py-2 text-[13px]"><Link href={`/opportunities/${o.id}`} className="font-medium text-navy-800 hover:underline">{o.name}</Link>
                <div className="text-2xs text-amber-800">{o.stage} · {o.reason}</div></li>
            ))}
          </ul>
          {!attention.length && <Empty>Every open deal has a current next action.</Empty>}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="5 · New opportunities worth reviewing" />
          <div className="grid divide-y divide-ink-100 md:grid-cols-2 md:divide-x md:divide-y-0">
            <div>
              {openToSell.length > 0 && <div className="px-4 pt-3 text-2xs font-medium uppercase tracking-wide text-ink-500">Owners who said they’re open to selling — no deal yet</div>}
              <ul className="divide-y divide-ink-100">
                {openToSell.map((a) => (
                  <li key={a.id} className="px-4 py-2 text-[13px]">
                    {a.property_id ? <Link href={`/properties/${a.property_id}`} className="font-medium text-navy-800 hover:underline">{a.street_address}</Link>
                      : a.entity_id ? <Link href={`/owners/${a.entity_id}`} className="font-medium text-navy-800 hover:underline">{a.entity_name}</Link>
                      : <Link href={`/contacts/${a.contact_id}`} className="font-medium text-navy-800 hover:underline">{a.contact_name}</Link>}
                    <div className="line-clamp-2 text-2xs text-ink-500">{ago(a.occurred_at)} · {a.body ?? "No notes"}</div>
                  </li>
                ))}
                {newOpps.map((o) => (
                  <li key={o.id} className="px-4 py-2 text-[13px]"><Link href={`/opportunities/${o.id}`} className="font-medium text-navy-800 hover:underline">{o.name}</Link><span className="text-2xs text-ink-500"> · new {ago(o.created_at)} · {o.stage}</span></li>
                ))}
                {reviews[0].n > 0 && <li className="px-4 py-2 text-[13px]"><Link href="/data#reviews" className="font-medium text-navy-800 hover:underline">{reviews[0].n} possible ownership changes</Link><span className="text-2xs text-ink-500"> · new owners from your latest import</span></li>}
              </ul>
              {!openToSell.length && !newOpps.length && !reviews[0].n && <Empty>Log a call with outcome “Open to selling” and it surfaces here until you open a deal.</Empty>}
            </div>
            <div className="px-4 py-3">
              <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-500">Prospect pools in your database</div>
              <ul className="space-y-1.5 text-[13px]">
                <li><Link className="text-navy-800 hover:underline" href="/properties?min_units=10&min_tenure=20&contacted=never&sort=tenure">{num(p.long_hold_10)} properties</Link> <span className="text-ink-500">· 10+ units, owned 20+ yrs, never contacted</span></li>
                <li><Link className="text-navy-800 hover:underline" href="/properties?min_units=5&max_units=30&min_tenure=25&owner_type=individual,trust&sort=tenure">{num(p.legacy_5_30)} properties</Link> <span className="text-ink-500">· 5–30 units, individual/trust owner, 25+ yrs</span></li>
                <li><Link className="text-navy-800 hover:underline" href="/properties?min_units=5&out_of_state=1">{num(p.oos_5)} properties</Link> <span className="text-ink-500">· 5+ units, out-of-state owner</span></li>
                <li><Link className="text-navy-800 hover:underline" href="/properties?min_units=5&contacted=180">{num(p.stale_5)} properties</Link> <span className="text-ink-500">· 5+ units, no outreach in 180 days</span></li>
              </ul>
              <p className="mt-2 text-2xs text-ink-400">Signals, not proof of motivation. Long tenure + low tax basis is a reason to call, nothing more.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recent owner conversations" />
          <div className="p-4"><Timeline items={recentConvos as unknown as TimelineItem[]} context="dashboard" /></div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Activity feed" action={
            <div className="flex gap-1">
              {(Object.keys(FEEDS) as (keyof typeof FEEDS)[]).map((f) => (
                <Link key={f} href={`/?feed=${f}`} className={cn("rounded px-2 py-0.5 text-2xs", feed === f ? "bg-navy-900 text-white" : "text-ink-500 hover:bg-ink-100")}>{FEEDS[f]}</Link>
              ))}
            </div>} />
          <div className="p-4"><Timeline items={feedItems as unknown as TimelineItem[]} context="dashboard" /></div>
        </Card>
      </div>
      <p className="mt-4 text-2xs text-ink-400">Tracking {num(k.properties)} properties and {num(k.owners)} ownership entities (includes second names on title). Commission defaults {(d.default_commission_rate * 100).toFixed(1)}% × {(d.default_brokerage_split * 100).toFixed(0)}% split.</p>
    </>
  );
}
