import { Card, CardHeader } from "@/components/ui";
import { money } from "@/lib/utils";

type Row = { kind: string; expected_close_date: string | null; closed_at: string | null; commission: number; prob: number };

/** Next 12 months of expected commission: gross (if everything closes) vs probability-weighted. */
export function Forecast({ rows, today }: { rows: Row[]; today: string }) {
  const open = rows.filter((r) => r.kind === "open" || r.kind === "under_contract");
  const start = new Date(today.slice(0, 7) + "-01T12:00:00Z");
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(start); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
  const bucket = (k: string) => open.filter((r) => r.expected_close_date?.startsWith(k));
  const lines = [
    { key: "past", label: "Past expected close", list: open.filter((r) => r.expected_close_date && r.expected_close_date.slice(0, 7) < months[0]) },
    ...months.map((m) => ({ key: m, label: new Date(m + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric" }), list: bucket(m) })),
    { key: "later", label: "Later", list: open.filter((r) => r.expected_close_date && r.expected_close_date.slice(0, 7) > months[11]) },
    { key: "none", label: "No close date", list: open.filter((r) => !r.expected_close_date) },
  ].map((l) => ({ ...l, gross: l.list.reduce((a, r) => a + r.commission, 0), weighted: l.list.reduce((a, r) => a + r.commission * r.prob / 100, 0) }));
  const max = Math.max(1, ...lines.map((l) => l.gross));
  const year = today.slice(0, 4);
  const closedYtd = rows.filter((r) => r.kind === "won" && r.closed_at?.startsWith(year)).reduce((a, r) => a + r.commission, 0);
  const next90 = open.filter((r) => r.expected_close_date && r.expected_close_date <= new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const totals = lines.reduce((a, l) => ({ g: a.g + l.gross, w: a.w + l.weighted }), { g: 0, w: 0 });
  return (
    <>
      <Card className="mb-4 grid grid-cols-2 divide-x divide-ink-100 md:grid-cols-4">
        {[[`Closed ${year} (your share)`, money(closedYtd)], ["Weighted, next 90 days", money(next90.reduce((a, r) => a + r.commission * r.prob / 100, 0))],
          ["Weighted, all open", money(totals.w)], ["Gross, all open", money(totals.g)]].map(([l, v]) => (
          <div key={l} className="px-4 py-3"><div className="text-2xs uppercase tracking-wide text-ink-500">{l}</div><div className="num mt-1 text-xl font-semibold">{v}</div></div>
        ))}
      </Card>
      <Card>
        <CardHeader title="Commission by expected close month" sub="Your share after split. Weighted = commission × deal probability (or stage default)." />
        <div className="flex gap-4 px-4 pt-3 text-2xs text-ink-600">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy-700" />Weighted</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy-100" />Gross (if all close)</span>
        </div>
        <table className="table-compact mt-2 w-full">
          <thead><tr><th>Month</th><th className="text-right">Deals</th><th className="w-1/2"></th><th className="text-right">Weighted</th><th className="text-right">Gross</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className={l.key === "past" && l.list.length ? "bg-amber-50/50" : ""}>
                <td className="whitespace-nowrap">{l.label}</td>
                <td className="num text-right">{l.list.length || "—"}</td>
                <td>
                  <div className="relative h-3" title={`${l.label}: weighted ${money(l.weighted)}, gross ${money(l.gross)}`}>
                    <div className="absolute inset-y-0 left-0 rounded-r bg-navy-100" style={{ width: `${(l.gross / max) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-r bg-navy-700" style={{ width: `${(l.weighted / max) * 100}%` }} />
                  </div>
                </td>
                <td className="num text-right">{l.weighted ? money(l.weighted) : "—"}</td>
                <td className="num text-right text-ink-500">{l.gross ? money(l.gross) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-2xs text-ink-500">Deals without a close date aren&apos;t in any month. Set one on each deal to make this forecast useful.</p>
      </Card>
    </>
  );
}
