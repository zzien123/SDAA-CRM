import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Badge, ButtonLink, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { OwnerTabs } from "@/components/owner-tabs";
import { ago, label, money, num, qs } from "@/lib/utils";

const PAGE = 50;
type F = { q?: string; type?: string; min_props?: string; min_units?: string; out_of_state?: string; has_people?: string; sort?: string; page?: string };

export default async function Owners({ searchParams }: { searchParams: Promise<F> }) {
  const s = await requireSession();
  const f = await searchParams;
  const page = Math.max(1, Number(f.page ?? 1) || 1);
  const c = [sql`e.org_id = ${s.orgId}`];
  for (const w of (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) c.push(sql`e.search_text ilike ${"%" + w + "%"}`);
  if (f.type) c.push(sql`e.entity_type = ${f.type}`);
  if (f.out_of_state === "1") c.push(sql`e.mailing_state is not null and e.mailing_state <> 'CA'`);
  if (f.has_people === "1") c.push(sql`exists (select 1 from entity_people ep where ep.entity_id = e.id)`);
  const where = c.reduce((a, b) => sql`${a} and ${b}`);
  const having = [sql`true`];
  if (Number(f.min_props) > 0) having.push(sql`count(p.id) >= ${Number(f.min_props)}`);
  if (Number(f.min_units) > 0) having.push(sql`coalesce(sum(p.units),0) >= ${Number(f.min_units)}`);
  const hv = having.reduce((a, b) => sql`${a} and ${b}`);
  const order = f.sort === "name" ? sql`e.name` : f.sort === "props" ? sql`props desc, units desc` : sql`units desc nulls last, props desc`;

  const base = sql`
    select e.id, e.name, e.entity_type, e.mailing_city, e.mailing_state, e.phone, e.phone_shared_count, e.care_of_name,
           count(p.id)::int as props, coalesce(sum(p.units),0)::int as units, sum(p.assessed_value) as assessed,
           (select count(*) from entity_people ep where ep.entity_id = e.id)::int as people,
           (select max(occurred_at) from activities a where a.entity_id = e.id and a.type <> 'note') as last_touch
    from entities e
    join property_ownerships po on po.entity_id = e.id and po.is_current
    join properties p on p.id = po.property_id
    where ${where} group by e.id having ${hv}`;
  const [rows, [{ n }]] = await Promise.all([
    sql`${base} order by ${order} limit ${PAGE} offset ${(page - 1) * PAGE}`,
    sql`select count(*)::int as n from (${base}) x`,
  ]);
  const b = { ...f, page: undefined } as Record<string, string | undefined>;
  const pages = Math.ceil(n / PAGE);
  return (
    <>
      <PageHeader title="Owners & Contacts" sub={`${num(n)} owners of record`} actions={<ButtonLink href="/contacts/new">New contact</ButtonLink>} />
      <OwnerTabs active="owners" />
      <Card className="mb-4 p-3">
        <form className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Input name="q" defaultValue={f.q} placeholder="Name, c/o, mailing, phone…" className="col-span-2" />
          <Select name="type" defaultValue={f.type ?? ""}>
            <option value="">Any type</option>
            {["individual", "trust", "llc", "limited_partnership", "partnership", "corporation", "nonprofit", "government", "other", "unknown"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
          <Input name="min_props" defaultValue={f.min_props} placeholder="Min properties" inputMode="numeric" />
          <Input name="min_units" defaultValue={f.min_units} placeholder="Min total units" inputMode="numeric" />
          <Select name="sort" defaultValue={f.sort ?? ""}><option value="">Sort: units</option><option value="props">Sort: # properties</option><option value="name">Sort: name</option></Select>
          <div className="flex gap-1"><button className="h-9 flex-1 rounded-md bg-navy-900 px-3 text-sm font-medium text-white">Filter</button><Link href="/owners" className="flex h-9 items-center px-2 text-xs text-ink-500">Clear</Link></div>
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="out_of_state" value="1" defaultChecked={f.out_of_state === "1"} /> Out-of-state mailing</label>
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="has_people" value="1" defaultChecked={f.has_people === "1"} /> Has linked people</label>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table className="table-compact w-full">
          <thead><tr><th>Owner</th><th>Type</th><th className="text-right">Props</th><th className="text-right">Units</th><th className="text-right">Assessed</th><th>Mailing</th><th>Phone (unverified)</th><th className="text-right">People</th><th>Last touch</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/owners/${r.id}`} className="font-medium text-navy-800 hover:underline">{r.name}</Link>{r.care_of_name && <div className="text-2xs text-ink-500">c/o {r.care_of_name}</div>}</td>
                <td className="text-ink-500">{label(r.entity_type)}</td>
                <td className="num text-right">{r.props}</td>
                <td className="num text-right">{num(r.units)}</td>
                <td className="num text-right">{money(r.assessed, { compact: true })}</td>
                <td className="whitespace-nowrap">{[r.mailing_city, r.mailing_state].filter(Boolean).join(", ")}{r.mailing_state && r.mailing_state !== "CA" && <Badge tone="navy" className="ml-1">OOS</Badge>}</td>
                <td className="whitespace-nowrap">{r.phone ?? "—"}{r.phone_shared_count > 1 && <Badge tone="amber" className="ml-1" title="Same number on several unrelated owners: likely a management company">Shared ×{r.phone_shared_count + 1}</Badge>}</td>
                <td className="num text-right">{r.people || "—"}</td>
                <td className="whitespace-nowrap text-ink-500">{r.last_touch ? ago(r.last_touch) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>No owners match.</Empty>}
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
          <span>Page {page} of {num(pages)}</span>
          <div className="flex gap-2">
            {page > 1 && <ButtonLink size="sm" variant="secondary" href={`/owners${qs(b, { page: String(page - 1) })}`}>Previous</ButtonLink>}
            {page < pages && <ButtonLink size="sm" variant="secondary" href={`/owners${qs(b, { page: String(page + 1) })}`}>Next</ButtonLink>}
          </div>
        </div>
      )}
    </>
  );
}
