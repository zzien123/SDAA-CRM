import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { commissionSql, orgSettings, stages } from "@/lib/queries";
import { Badge, ButtonLink, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { StageSelect } from "./stage-select";
import { date, money, today } from "@/lib/utils";

export default async function Opportunities({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const s = await requireSession();
  const { closed } = await searchParams;
  const d = await orgSettings(s.orgId);
  const [st, rows] = await Promise.all([
    stages(s.orgId),
    sql`select o.*, st.name as stage, st.kind, st.position, st.default_probability,
               p.street_address, p.units, e.name as seller_entity, sc.full_name as seller_name, bc.full_name as buyer_name,
               ${commissionSql(d.default_commission_rate, d.default_brokerage_split)} as commission,
               coalesce(o.probability, st.default_probability) as prob
        from opportunities o join pipeline_stages st on st.id = o.stage_id
        left join properties p on p.id = o.property_id left join entities e on e.id = o.seller_entity_id
        left join contacts sc on sc.id = o.seller_contact_id left join contacts bc on bc.id = o.buyer_contact_id
        where o.org_id = ${s.orgId} ${closed === "1" ? sql`` : sql`and st.kind in ('open','under_contract')`}
        order by st.position, o.expected_close_date nulls last`,
  ]);
  const open = rows.filter((r) => r.kind === "open" || r.kind === "under_contract");
  const gross = open.reduce((a, r) => a + Number(r.expected_price ?? r.asking_price ?? 0), 0);
  const comm = open.reduce((a, r) => a + Number(r.commission), 0);
  const weighted = open.reduce((a, r) => a + Number(r.commission) * Number(r.prob) / 100, 0);
  const t = today();
  return (
    <>
      <PageHeader title="Opportunities" sub="Visual Kanban board ships in Phase 2. Stage changes here are logged to each deal's timeline."
        actions={<><ButtonLink variant="secondary" href={closed === "1" ? "/opportunities" : "/opportunities?closed=1"}>{closed === "1" ? "Hide closed" : "Show closed / lost"}</ButtonLink><ButtonLink href="/opportunities/new">New opportunity</ButtonLink></>} />
      <Card className="mb-4 grid grid-cols-2 divide-x divide-ink-100 md:grid-cols-4">
        <Stat label="Open deals" value={open.length} />
        <Stat label="Gross pipeline" value={money(gross, { compact: true })} sub="expected price, or asking" />
        <Stat label="Potential commission" value={money(comm, { compact: true })} sub="your share, after split" />
        <Stat label="Probability-weighted" value={money(weighted, { compact: true })} sub="commission × probability" />
      </Card>
      <div className="space-y-4">
        {st.filter((x) => rows.some((r) => r.stage_id === x.id)).map((stage) => {
          const list = rows.filter((r) => r.stage_id === stage.id);
          return (
            <Card key={stage.id} className="overflow-x-auto">
              <CardHeader title={`${stage.name} · ${list.length}`} sub={`${money(list.reduce((a, r) => a + Number(r.expected_price ?? r.asking_price ?? 0), 0), { compact: true })} · default ${Number(stage.default_probability)}%`} />
              <table className="table-compact w-full">
                <thead><tr><th>Deal</th><th>Seller</th><th>Buyer</th><th className="text-right">Price</th><th className="text-right">Prob.</th><th className="text-right">Commission</th><th>Close</th><th>Next action</th><th>Stage</th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/opportunities/${r.id}`} className="font-medium text-navy-800 hover:underline">{r.name}</Link>{r.street_address && r.street_address !== r.name && <div className="text-2xs text-ink-500">{r.street_address}{r.units ? ` · ${r.units}u` : ""}</div>}</td>
                      <td>{r.seller_name ?? r.seller_entity ?? "—"}</td>
                      <td>{r.buyer_name ?? "—"}</td>
                      <td className="num text-right">{money(r.expected_price ?? r.asking_price, { compact: true })}</td>
                      <td className="num text-right">{Number(r.prob)}%</td>
                      <td className="num text-right">{money(r.commission, { compact: true })}</td>
                      <td className="whitespace-nowrap">{date(r.expected_close_date)}</td>
                      <td>{r.next_action ?? "—"}{r.next_action_date && <div className={`text-2xs ${r.next_action_date < t ? "font-medium text-red-700" : "text-ink-500"}`}>{date(r.next_action_date)}</div>}</td>
                      <td><StageSelect id={r.id} value={r.stage_id} stages={st.map((x) => ({ id: x.id, name: x.name }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
        {!rows.length && <Card className="p-6 text-center text-[13px] text-ink-500">No opportunities yet. Create one from a property page, or <Link href="/opportunities/new" className="text-navy-700 underline">start one here</Link>.</Card>}
      </div>
      <p className="mt-3 text-2xs text-ink-500"><Badge>Note</Badge> Commission = (expected price or asking) × commission rate × your split; deal-level values override the defaults in Settings.</p>
    </>
  );
}
