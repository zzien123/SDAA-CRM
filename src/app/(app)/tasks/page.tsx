import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Card, CardHeader, PageHeader, Badge } from "@/components/ui";
import { NewTask, TaskList, type TaskRow } from "@/components/activity";
import { cn, date, today } from "@/lib/utils";

const VIEWS = { today: "Today & overdue", week: "Next 7 days", all: "All open", done: "Completed (30 days)" } as const;

export default async function Tasks({ searchParams }: { searchParams: Promise<{ view?: keyof typeof VIEWS }> }) {
  const s = await requireSession();
  const { view = "today" } = await searchParams;
  const t = today();
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const filter = view === "done" ? sql`t.status = 'done' and t.completed_at > now() - interval '30 days'`
    : view === "week" ? sql`t.status = 'open' and t.due_date <= ${week}`
    : view === "all" ? sql`t.status = 'open'`
    : sql`t.status = 'open' and (t.due_date <= ${t} or t.due_date is null and t.priority = 1)`;
  const [rows, counts] = await Promise.all([
    sql`select t.*, p.street_address, c.full_name as contact_name, e.name as entity_name, o.name as opp_name
        from tasks t left join properties p on p.id = t.property_id left join contacts c on c.id = t.contact_id
        left join entities e on e.id = t.entity_id left join opportunities o on o.id = t.opportunity_id
        where t.org_id = ${s.orgId} and ${filter}
        order by ${view === "done" ? sql`t.completed_at desc` : sql`t.due_date nulls last, t.priority`} limit 300`,
    sql`select count(*) filter (where status='open' and due_date < ${t})::int as overdue,
               count(*) filter (where status='open' and due_date = ${t})::int as today,
               count(*) filter (where status='open')::int as open from tasks where org_id = ${s.orgId}`,
  ]);
  // group by day for week/all views
  const groups = new Map<string, TaskRow[]>();
  for (const r of rows as unknown as TaskRow[]) {
    const k = view === "done" ? "Completed" : !r.due_date ? "No date" : r.due_date < t ? "Overdue" : r.due_date === t ? "Today" : date(r.due_date);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <>
      <PageHeader title="Tasks" sub={<>{counts[0].open} open · <span className={counts[0].overdue ? "text-red-700" : ""}>{counts[0].overdue} overdue</span> · {counts[0].today} due today</>} />
      <Card className="mb-4 p-3"><NewTask links={{}} /></Card>
      <div className="mb-3 flex gap-1">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => (
          <Link key={k} href={`/tasks?view=${k}`} className={cn("rounded-md px-3 py-1.5 text-xs", view === k ? "bg-navy-900 text-white" : "text-ink-700 hover:bg-ink-100")}>{VIEWS[k]}</Link>
        ))}
      </div>
      <div className="space-y-3">
        {[...groups.entries()].map(([k, list]) => (
          <Card key={k}>
            <CardHeader title={<>{k} {k === "Overdue" && <Badge tone="red">{list.length}</Badge>}</>} />
            <div className="px-4 py-1">
              {view === "done"
                ? <ul className="divide-y divide-ink-100">{list.map((x) => <li key={x.id} className="py-2 text-[13px] text-ink-500 line-through">{x.title}</li>)}</ul>
                : <TaskList tasks={list} />}
            </div>
          </Card>
        ))}
        {!rows.length && <Card className="p-6 text-center text-[13px] text-ink-500">Nothing here.</Card>}
      </div>
    </>
  );
}
