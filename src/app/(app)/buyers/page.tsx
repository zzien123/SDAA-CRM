import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Badge, ButtonLink, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { ago, date, label, money, num, today } from "@/lib/utils";

type F = { q?: string; market?: string; units?: string; price?: string; strategy?: string; x1031?: string; inactive?: string };

export default async function Buyers({ searchParams }: { searchParams: Promise<F> }) {
  const s = await requireSession();
  const f = await searchParams;
  const c = [sql`b.org_id = ${s.orgId}`];
  if (f.inactive !== "1") c.push(sql`b.is_active`);
  for (const w of (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean)) c.push(sql`(ct.search_text ilike ${"%" + w + "%"} or lower(b.label) like ${"%" + w + "%"})`);
  if (f.market) c.push(sql`exists (select 1 from unnest(b.target_markets) m where lower(m) like ${"%" + f.market.toLowerCase() + "%"})`);
  // "fits" filters only pass when the buyer's range is KNOWN and contains the value
  if (Number(f.units) > 0) c.push(sql`b.min_units is not null and b.max_units is not null and ${Number(f.units)} between b.min_units and b.max_units`);
  if (Number(f.price) > 0) c.push(sql`b.max_price is not null and ${Number(f.price)} <= b.max_price and ${Number(f.price)} >= coalesce(b.min_price, 0)`);
  if (f.strategy) c.push(sql`b.strategy in (${f.strategy}, 'any')`);
  if (f.x1031 === "1") c.push(sql`b.is_1031`);
  const where = c.reduce((a, b) => sql`${a} and ${b}`);
  const rows = await sql`
    select b.*, ct.full_name, ct.last_contacted_at, ct.next_follow_up_at, co.name as company
    from buyer_criteria b join contacts ct on ct.id = b.contact_id left join companies co on co.id = ct.company_id
    where ${where} order by b.exchange_id_deadline nulls last, ct.last_contacted_at desc nulls last limit 500`;
  const t = today();
  return (
    <>
      <PageHeader title="Buyers" sub={`${num(rows.length)} acquisition profiles · ${new Set(rows.map((r) => r.contact_id)).size} buyers`} actions={<ButtonLink href="/contacts/new?category=investor_buyer">New buyer</ButtonLink>} />
      <Card className="mb-4 p-3">
        <form className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Input name="q" defaultValue={f.q} placeholder="Buyer or profile…" className="col-span-2" />
          <Input name="market" defaultValue={f.market} placeholder="Market (e.g. North Park)" />
          <Input name="units" defaultValue={f.units} placeholder="Fits # units" inputMode="numeric" />
          <Input name="price" defaultValue={f.price} placeholder="Fits price $" inputMode="numeric" />
          <Select name="strategy" defaultValue={f.strategy ?? ""}><option value="">Any strategy</option>{["value_add", "stabilized", "development", "owner_user"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select>
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="x1031" value="1" defaultChecked={f.x1031 === "1"} /> 1031 only</label>
          <div className="flex gap-1"><button className="h-9 flex-1 rounded-md bg-navy-900 px-3 text-sm font-medium text-white">Filter</button><Link href="/buyers" className="flex h-9 items-center px-2 text-xs text-ink-500">Clear</Link></div>
        </form>
        <p className="mt-2 text-2xs text-ink-500">“Fits” filters only return buyers whose range is known. A blank range is unknown, not a match. Ranked matching with explanations ships in Phase 2.</p>
      </Card>
      <Card className="overflow-x-auto">
        <table className="table-compact w-full">
          <thead><tr><th>Buyer</th><th>Profile</th><th>Markets</th><th className="text-right">Units</th><th className="text-right">Price</th><th className="text-right">Equity</th><th>Strategy</th><th>1031</th><th>Confirmed</th><th>Last contact</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/contacts/${r.contact_id}`} className="font-medium text-navy-800 hover:underline">{r.full_name}</Link>{r.company && <div className="text-2xs text-ink-500">{r.company}</div>}</td>
                <td>{r.label}{!r.is_active && <Badge className="ml-1">Inactive</Badge>}</td>
                <td className="max-w-[220px] text-2xs">{r.target_markets?.join(", ") || <span className="text-ink-400">unknown</span>}</td>
                <td className="num whitespace-nowrap text-right">{r.min_units || r.max_units ? `${r.min_units ?? "?"}–${r.max_units ?? "?"}` : "—"}</td>
                <td className="num whitespace-nowrap text-right">{r.min_price || r.max_price ? `${money(r.min_price, { compact: true })}–${money(r.max_price, { compact: true })}` : "—"}</td>
                <td className="num text-right">{money(r.available_equity, { compact: true })}</td>
                <td>{r.strategy ? label(r.strategy) : "—"}</td>
                <td className="whitespace-nowrap">{r.is_1031 ? <Badge tone={r.exchange_id_deadline && r.exchange_id_deadline < t ? "gray" : "amber"}>ID {date(r.exchange_id_deadline)}</Badge> : r.is_1031 === false ? "No" : "—"}</td>
                <td className="whitespace-nowrap text-ink-500">{r.last_confirmed_at ? ago(r.last_confirmed_at) : "never"}</td>
                <td className="whitespace-nowrap text-ink-500">{ago(r.last_contacted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>No buyer profiles yet. Add a contact as a buyer, then add one or more acquisition criteria profiles.</Empty>}
      </Card>
    </>
  );
}
