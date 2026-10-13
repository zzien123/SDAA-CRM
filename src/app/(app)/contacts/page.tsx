import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Badge, ButtonLink, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { OwnerTabs } from "@/components/owner-tabs";
import { CATEGORIES, STATUSES } from "@/lib/constants";
import { ago, date, label, num, qs, today } from "@/lib/utils";

const PAGE = 50;
type F = { q?: string; category?: string; status?: string; followup?: string; company?: string; page?: string };

export default async function Contacts({ searchParams }: { searchParams: Promise<F> }) {
  const s = await requireSession();
  const f = await searchParams;
  const page = Math.max(1, Number(f.page ?? 1) || 1);
  const c = [sql`c.org_id = ${s.orgId}`];
  for (const w of (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) c.push(sql`c.search_text ilike ${"%" + w + "%"}`);
  if (f.category) c.push(sql`exists (select 1 from contact_categories cc where cc.contact_id = c.id and cc.category = ${f.category})`);
  if (f.status) c.push(sql`c.relationship_status = ${f.status}`);
  if (f.company && /^[0-9a-f-]{36}$/.test(f.company)) c.push(sql`c.company_id = ${f.company}`);
  if (f.followup === "due") c.push(sql`c.next_follow_up_at <= ${today()}`);
  if (f.followup === "none") c.push(sql`c.next_follow_up_at is null and not c.do_not_contact`);
  if (f.followup === "stale") c.push(sql`(c.last_contacted_at is null or c.last_contacted_at < now() - interval '90 days') and not c.do_not_contact`);
  const where = c.reduce((a, b) => sql`${a} and ${b}`);
  const [rows, [{ n }]] = await Promise.all([
    sql`select c.id, c.full_name, c.title, c.relationship_status, c.last_contacted_at, c.next_follow_up_at, c.do_not_contact, co.name as company,
               (select array_agg(category order by category) from contact_categories where contact_id = c.id) as cats,
               (select phone from contact_phones where contact_id = c.id order by is_primary desc limit 1) as phone,
               (select email from contact_emails where contact_id = c.id order by is_primary desc limit 1) as email,
               (select count(*) from entity_people where contact_id = c.id)::int as entities
        from contacts c left join companies co on co.id = c.company_id where ${where}
        order by c.next_follow_up_at nulls last, c.last_contacted_at desc nulls last, c.last_name limit ${PAGE} offset ${(page - 1) * PAGE}`,
    sql`select count(*)::int as n from contacts c where ${where}`,
  ]);
  const b = { ...f, page: undefined } as Record<string, string | undefined>;
  const t = today();
  return (
    <>
      <PageHeader title="Owners & Contacts" sub={`${num(n)} people`} actions={<ButtonLink href="/contacts/new">New contact</ButtonLink>} />
      <OwnerTabs active="contacts" />
      <Card className="mb-4 p-3">
        <form className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Input name="q" defaultValue={f.q} placeholder="Name, company, title…" className="col-span-2" />
          <Select name="category" defaultValue={f.category ?? ""}><option value="">Any category</option>{CATEGORIES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select>
          <Select name="status" defaultValue={f.status ?? ""}><option value="">Any status</option>{STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select>
          <Select name="followup" defaultValue={f.followup ?? ""}><option value="">Any follow-up</option><option value="due">Follow-up due</option><option value="none">No follow-up set</option><option value="stale">Not contacted 90+ days</option></Select>
          <div className="flex gap-1"><button className="h-9 flex-1 rounded-md bg-navy-900 px-3 text-sm font-medium text-white">Filter</button><Link href="/contacts" className="flex h-9 items-center px-2 text-xs text-ink-500">Clear</Link></div>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table className="table-compact w-full">
          <thead><tr><th>Name</th><th>Company</th><th>Categories</th><th>Phone / email</th><th>Status</th><th>Last contact</th><th>Next follow-up</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/contacts/${r.id}`} className="font-medium text-navy-800 hover:underline">{r.full_name}</Link>{r.title && <div className="text-2xs text-ink-500">{r.title}</div>}</td>
                <td>{r.company ?? "—"}</td>
                <td><div className="flex flex-wrap gap-1">{(r.cats ?? []).map((x: string) => <Badge key={x}>{label(x)}</Badge>)}{r.entities > 0 && <Badge tone="navy">{r.entities} entit{r.entities === 1 ? "y" : "ies"}</Badge>}</div></td>
                <td className="text-2xs">{r.phone}{r.phone && r.email && <br />}{r.email}</td>
                <td>{r.do_not_contact ? <Badge tone="red">Do not contact</Badge> : <Badge tone={["relationship", "client"].includes(r.relationship_status) ? "green" : "gray"}>{label(r.relationship_status)}</Badge>}</td>
                <td className="whitespace-nowrap text-ink-500">{ago(r.last_contacted_at)}</td>
                <td className={`whitespace-nowrap ${r.next_follow_up_at && r.next_follow_up_at <= t ? "font-medium text-red-700" : ""}`}>{date(r.next_follow_up_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>No contacts yet. People get added when you link them to an owner, a property, or create them directly. The import doesn’t create people from owner names on purpose.</Empty>}
      </Card>
      {n > PAGE && (
        <div className="mt-3 flex justify-end gap-2">
          {page > 1 && <ButtonLink size="sm" variant="secondary" href={`/contacts${qs(b, { page: String(page - 1) })}`}>Previous</ButtonLink>}
          {page * PAGE < n && <ButtonLink size="sm" variant="secondary" href={`/contacts${qs(b, { page: String(page + 1) })}`}>Next</ButtonLink>}
        </div>
      )}
    </>
  );
}
