import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { orgSettings, stages } from "@/lib/queries";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { CommissionForm, NewStage, StageRow } from "./client";
import { label } from "@/lib/utils";

export default async function Settings() {
  const s = await requireSession();
  const [d, st, members] = await Promise.all([
    orgSettings(s.orgId), stages(s.orgId),
    sql`select u.email, u.full_name, m.role from memberships m join users u on u.id = m.user_id where m.org_id = ${s.orgId} order by m.role`,
  ]);
  const admin = s.role === "admin";
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Commission defaults" sub="Used when a deal doesn't set its own rate or split" />
          <div className="p-4">{admin ? <CommissionForm rate={d.default_commission_rate} split={d.default_brokerage_split} /> : <p className="text-[13px]">{(d.default_commission_rate * 100).toFixed(2)}% · split {(d.default_brokerage_split * 100).toFixed(0)}%</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Team" sub="New users can sign in only if their email is in ALLOWED_EMAILS" />
          <ul className="divide-y divide-ink-100">
            {members.map((m) => <li key={m.email} className="flex items-center justify-between px-4 py-2 text-[13px]"><span>{m.full_name ?? m.email}<span className="ml-2 text-2xs text-ink-500">{m.email}</span></span><Badge>{label(m.role)}</Badge></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Pipeline stages" sub="Name · default probability %. Custom stages are added before Closed." />
          <div className="space-y-2 p-4">
            {st.map((x) => admin && x.kind !== "won" && x.kind !== "lost"
              ? <StageRow key={x.id} id={x.id} name={x.name} prob={Number(x.default_probability)} />
              : <div key={x.id} className="text-[13px]">{x.name} <span className="text-ink-500">· {Number(x.default_probability)}%</span></div>)}
            {admin && <div className="border-t border-ink-100 pt-3"><NewStage /></div>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Integrations" />
          <ul className="divide-y divide-ink-100 text-[13px]">
            {[["Gmail", "Phase 3"], ["Google Calendar", "Phase 3"], ["AI summaries & search", "Phase 3"], ["Map & geocoding (Google / Mapbox)", "Phase 2"], ["Supabase Storage (documents)", "Phase 3"]].map(([n, p]) => (
              <li key={n} className="flex items-center justify-between px-4 py-2">{n}<Badge>{p}</Badge></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
