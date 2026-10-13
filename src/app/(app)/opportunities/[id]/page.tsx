import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { commissionSql, openTasks, orgSettings, stages, timeline } from "@/lib/queries";
import { Badge, Card, CardHeader, DL } from "@/components/ui";
import { Disclosure } from "@/components/forms";
import { LogActivity, NewTask, TaskList, Timeline, type TaskRow, type TimelineItem } from "@/components/activity";
import { OpportunityForm } from "@/components/opportunity-form";
import { StageSelect } from "../stage-select";
import { BuyerMatches } from "@/components/buyer-matches";
import { date, money } from "@/lib/utils";

export default async function OppPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await orgSettings(s.orgId);
  const [o] = await sql`
    select o.*, st.name as stage, st.default_probability, p.street_address, p.units, e.name as seller_entity, sc.full_name as seller_name, bc.full_name as buyer_name,
           ${commissionSql(d.default_commission_rate, d.default_brokerage_split)} as commission, coalesce(o.probability, st.default_probability) as prob
    from opportunities o join pipeline_stages st on st.id = o.stage_id left join properties p on p.id = o.property_id
    left join entities e on e.id = o.seller_entity_id left join contacts sc on sc.id = o.seller_contact_id left join contacts bc on bc.id = o.buyer_contact_id
    where o.id = ${id} and o.org_id = ${s.orgId}`;
  if (!o) notFound();
  const [st, acts, tasks] = await Promise.all([stages(s.orgId), timeline(s.orgId, { opportunityId: id }), openTasks(s.orgId, { opportunityId: id })]);
  const price = o.expected_price ?? o.asking_price;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{o.name}</h1><Badge tone="navy">{o.stage}</Badge></div>
          <div className="mt-0.5 text-sm text-ink-500">
            {o.property_id && <Link href={`/properties/${o.property_id}`} className="hover:underline">{o.street_address}</Link>}
            {o.units ? ` · ${o.units} units` : ""} · {money(price)} · {Number(o.prob)}% · est. commission {money(o.commission)}
          </div>
        </div>
        <StageSelect id={id} value={o.stage_id} stages={st.map((x) => ({ id: x.id, name: x.name }))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Deal" />
            <div className="p-4">
              <DL items={[
                ["Seller", o.seller_contact_id ? <Link key="s" className="text-navy-800 hover:underline" href={`/contacts/${o.seller_contact_id}`}>{o.seller_name}</Link> : "—"],
                ["Seller entity", o.seller_entity_id ? <Link key="e" className="text-navy-800 hover:underline" href={`/owners/${o.seller_entity_id}`}>{o.seller_entity}</Link> : "—"],
                ["Buyer", o.buyer_contact_id ? <Link key="b" className="text-navy-800 hover:underline" href={`/contacts/${o.buyer_contact_id}`}>{o.buyer_name}</Link> : "—"],
                ["Asking", money(o.asking_price)], ["Expected", money(o.expected_price)], ["$/unit", price && o.units ? money(Number(price) / o.units) : "—"],
                ["Commission rate", `${((o.commission_rate ?? d.default_commission_rate) * 100).toFixed(2)}%${o.commission_rate === null ? " (default)" : ""}`],
                ["Your split", `${((o.brokerage_split ?? d.default_brokerage_split) * 100).toFixed(0)}%${o.brokerage_split === null ? " (default)" : ""}`],
                ["Weighted commission", money(Number(o.commission) * Number(o.prob) / 100)],
                ["Expected close", date(o.expected_close_date)], ["Source", o.deal_source ?? "—"], ["Next action", o.next_action ? `${o.next_action}${o.next_action_date ? " · " + date(o.next_action_date) : ""}` : "—"],
              ]} />
              {o.notes && <p className="mt-3 whitespace-pre-wrap text-[13px]">{o.notes}</p>}
              <Disclosure label="Edit deal" className="mt-3">
                <OpportunityForm o={{ ...o }} stages={st as never} defaults={d} labels={{ property: o.street_address, seller_contact: o.seller_name, seller_entity: o.seller_entity, buyer_contact: o.buyer_name }} />
              </Disclosure>
            </div>
          </Card>
          {o.property_id && <BuyerMatches orgId={s.orgId} propertyId={o.property_id} opportunityId={id} address={o.street_address} />}
          <Card>
            <CardHeader title="Activity" />
            <div className="border-b border-ink-100 p-4"><LogActivity links={{ opportunity_id: id, property_id: o.property_id ?? undefined, contact_id: o.seller_contact_id ?? undefined }} /></div>
            <div className="p-4"><Timeline items={acts as unknown as TimelineItem[]} context="opportunity" /></div>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Tasks" />
          <div className="px-4 py-2"><TaskList tasks={tasks as unknown as TaskRow[]} showLinks={false} /></div>
          <div className="border-t border-ink-100 p-3"><NewTask compact links={{ opportunity_id: id, property_id: o.property_id ?? undefined }} /></div>
        </Card>
      </div>
    </>
  );
}
