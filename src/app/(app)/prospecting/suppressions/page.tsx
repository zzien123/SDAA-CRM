import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { DncToggle, RemoveSuppression, SuppressionForm } from "../client";
import { date, label } from "@/lib/utils";

export default async function Suppressions() {
  const s = await requireSession();
  const [owners, people, values] = await Promise.all([
    sql`select id, name, dnc_reason, dnc_at from entities where org_id = ${s.orgId} and do_not_contact order by dnc_at desc nulls last limit 500`,
    sql`select id, full_name from contacts where org_id = ${s.orgId} and do_not_contact order by updated_at desc limit 500`,
    sql`select s.*, e.name as entity_name from suppressions s left join entities e on e.id = s.entity_id where s.org_id = ${s.orgId} order by s.created_at desc limit 1000`,
  ]);
  const fmt = (k: string, v: string) => (k === "phone" && v.length === 10 ? `(${v.slice(0, 3)}) ${v.slice(3, 6)}-${v.slice(6)}` : k === "mailing_address" ? v.replace("|", " · ") : v);
  return (
    <>
      <PageHeader title="Do-not-contact & opt-outs" sub="Enforced in the prospecting queue, list exports and property exports." />
      <Card className="mb-4 p-4">
        <SuppressionForm />
        <p className="mt-2 text-2xs text-ink-500">Phone numbers from the county list are not scrubbed against the National Do Not Call Registry. Scrub call lists before cold-calling residential or mobile numbers, and confirm your obligations with counsel.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Suppressed numbers, emails & addresses (${values.length})`} />
          <table className="table-compact w-full">
            <thead><tr><th>Type</th><th>Value</th><th>Reason</th><th>Owner</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {values.map((v) => (
                <tr key={v.id}>
                  <td>{label(v.kind)}</td><td className="font-mono text-2xs">{fmt(v.kind, v.value)}</td><td>{label(v.reason)}</td>
                  <td>{v.entity_id ? <Link href={`/owners/${v.entity_id}`} className="text-navy-700 hover:underline">{v.entity_name}</Link> : "—"}</td>
                  <td className="whitespace-nowrap">{date(v.created_at)}</td><td><RemoveSuppression id={v.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!values.length && <Empty>Nothing suppressed yet.</Empty>}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={`Owners (${owners.length})`} />
            <ul className="divide-y divide-ink-100">
              {owners.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                  <span><Link href={`/owners/${o.id}`} className="text-navy-800 hover:underline">{o.name}</Link><div className="text-2xs text-ink-500">{o.dnc_reason} · {date(o.dnc_at)}</div></span>
                  <DncToggle entityId={o.id} on />
                </li>
              ))}
            </ul>
            {!owners.length && <Empty>None.</Empty>}
          </Card>
          <Card>
            <CardHeader title={`People (${people.length})`} />
            <ul className="divide-y divide-ink-100">{people.map((p) => <li key={p.id} className="px-4 py-2 text-[13px]"><Link href={`/contacts/${p.id}`} className="text-navy-800 hover:underline">{p.full_name}</Link></li>)}</ul>
            {!people.length && <Empty>None.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
