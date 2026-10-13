import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Badge, ButtonLink, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { NewListForm } from "./client";
import { ago, label, num, today } from "@/lib/utils";

const PRESETS: { name: string; filters: Record<string, string> }[] = [
  { name: "10+ units · owned 20+ yrs · never contacted", filters: { min_units: "10", min_tenure: "20", contacted: "never" } },
  { name: "5–30 units · individual/trust · 25+ yrs", filters: { min_units: "5", max_units: "30", min_tenure: "25", owner_type: "individual,trust" } },
  { name: "5+ units · out-of-state owners", filters: { min_units: "5", out_of_state: "1" } },
  { name: "5+ units · no outreach in 180 days", filters: { min_units: "5", contacted: "180" } },
];

export default async function Prospecting({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const s = await requireSession();
  const { archived } = await searchParams;
  const t = today();
  const lists = await sql`
    select l.*,
      (select count(distinct entity_id) from prospect_list_items i where i.list_id = l.id)::int as owners,
      (select count(*) from prospect_list_items i where i.list_id = l.id)::int as props,
      (select count(distinct entity_id) from prospect_list_items i where i.list_id = l.id and i.status <> 'queued')::int as touched,
      (select count(distinct entity_id) from prospect_list_items i where i.list_id = l.id and i.status in ('connected','interested','converted'))::int as connected,
      (select count(distinct entity_id) from prospect_list_items i where i.list_id = l.id and i.status in ('interested','converted'))::int as interested,
      (select count(distinct entity_id) from prospect_list_items i where i.list_id = l.id and i.status = 'converted')::int as converted,
      (select count(distinct entity_id) from prospect_list_items i where i.list_id = l.id and i.next_action_date <= ${t}
         and i.status not in ('do_not_contact','converted','skipped'))::int as due,
      (select max(last_attempt_at) from prospect_list_items i where i.list_id = l.id) as last_worked
    from prospect_lists l where l.org_id = ${s.orgId} and l.is_archived = ${archived === "1"} order by l.created_at desc`;
  return (
    <>
      <PageHeader title="Prospecting" sub="Saved owner lists, worked one owner at a time. Every touch is logged to the owner's timeline."
        actions={<><ButtonLink variant="secondary" href="/prospecting/suppressions">Do-not-contact & opt-outs</ButtonLink>
          <ButtonLink variant="ghost" href={archived === "1" ? "/prospecting" : "/prospecting?archived=1"}>{archived === "1" ? "Active lists" : "Archived"}</ButtonLink></>} />
      <Card className="mb-4">
        <CardHeader title="Lists" />
        <div className="overflow-x-auto">
          <table className="table-compact w-full">
            <thead><tr><th>List</th><th className="text-right">Owners</th><th className="text-right">Props</th><th>Progress</th><th className="text-right">Connected</th><th className="text-right">Interested</th><th className="text-right">Deals</th><th className="text-right">Due today</th><th>Last worked</th></tr></thead>
            <tbody>
              {lists.map((l) => {
                const pct = l.owners ? Math.round((l.touched / l.owners) * 100) : 0;
                return (
                  <tr key={l.id}>
                    <td><Link href={`/prospecting/${l.id}`} className="font-medium text-navy-800 hover:underline">{l.name}</Link>
                      <div className="text-2xs text-ink-500">{Object.entries(l.filters as Record<string, string>).map(([k, v]) => `${label(k)}: ${v}`).join(" · ")}</div></td>
                    <td className="num text-right">{num(l.owners)}</td>
                    <td className="num text-right">{num(l.props)}</td>
                    <td className="min-w-[140px]"><div className="h-1.5 w-full rounded bg-ink-100"><div className="h-1.5 rounded bg-navy-700" style={{ width: `${pct}%` }} /></div><div className="text-2xs text-ink-500">{pct}% touched</div></td>
                    <td className="num text-right">{num(l.connected)}</td>
                    <td className="num text-right">{l.interested ? <Badge tone="green">{l.interested}</Badge> : 0}</td>
                    <td className="num text-right">{num(l.converted)}</td>
                    <td className="num text-right">{l.due ? <Badge tone="amber">{l.due}</Badge> : 0}</td>
                    <td className="whitespace-nowrap text-ink-500">{l.last_worked ? ago(l.last_worked) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lists.length && <Empty>No lists yet. Start from a preset below, or filter the Properties page and click “Save as prospect list”.</Empty>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Start a list from a preset" sub="Owners already marked do-not-contact are left out automatically. Max 5,000 properties per list." />
        <div className="divide-y divide-ink-100">
          {PRESETS.map((p) => (
            <div key={p.name} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_minmax(0,520px)] md:items-center">
              <div className="text-[13px]">{p.name} <Link className="text-2xs text-navy-700 hover:underline" href={`/properties?${new URLSearchParams(p.filters)}`}>preview</Link></div>
              <NewListForm compact filters={p.filters} defaultName={p.name} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
