import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { propertyOrder, propertyWhere, type PropertyFilters } from "@/lib/property-filters";
import { Badge, ButtonLink, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { ago, label, money, num, qs } from "@/lib/utils";

const PAGE = 50;

export default async function Properties({ searchParams }: { searchParams: Promise<PropertyFilters> }) {
  const s = await requireSession();
  const f = await searchParams;
  const page = Math.max(1, Number(f.page ?? 1) || 1);
  const where = propertyWhere(s.orgId, f);
  const [rows, [{ n, units }], cities] = await Promise.all([
    sql`select id, street_address, city, zip, units, year_built, assessed_value, last_sale_date, tenure_years, apns,
               owner_entity_id, owner_name, owner_type, owner_absentee, owner_out_of_state, listing_status, last_outreach_at, data_flags
        from property_overview where ${where} ${propertyOrder(f)} limit ${PAGE} offset ${(page - 1) * PAGE}`,
    sql`select count(*)::int as n, coalesce(sum(units),0)::int as units from property_overview where ${where}`,
    sql`select city, count(*)::int as n from properties where org_id = ${s.orgId} and city is not null group by city order by n desc`,
  ]);
  const base = { ...f, page: undefined } as Record<string, string | undefined>;
  const sortLink = (key: string, text: string) => {
    const active = (f.sort ?? "units") === key;
    const dir = active && f.dir !== "asc" ? "asc" : undefined;
    return <Link href={`/properties${qs(base, { sort: key, dir })}`} className={active ? "text-navy-900" : ""}>{text}{active ? (f.dir === "asc" ? " ↑" : " ↓") : ""}</Link>;
  };
  const pages = Math.ceil(n / PAGE);
  return (
    <>
      <PageHeader title="Properties" sub={`${num(n)} properties · ${num(units)} units`}
        actions={<>
          <ButtonLink variant="secondary" href={`/api/export/properties${qs(base, {})}`}>Export CSV</ButtonLink>
          <ButtonLink href="/properties/new">Add property</ButtonLink>
        </>} />
      <Card className="mb-4 p-3">
        <form className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Input name="q" defaultValue={f.q} placeholder="Address, APN, owner…" className="col-span-2" />
          <Select name="city" defaultValue={f.city ?? ""}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c.city} value={c.city}>{c.city} ({c.n})</option>)}
          </Select>
          <Input name="zip" defaultValue={f.zip} placeholder="ZIP(s)" />
          <div className="flex gap-1"><Input name="min_units" defaultValue={f.min_units} placeholder="Min units" inputMode="numeric" /><Input name="max_units" defaultValue={f.max_units} placeholder="Max" inputMode="numeric" /></div>
          <div className="flex gap-1"><Input name="min_year" defaultValue={f.min_year} placeholder="Built ≥" inputMode="numeric" /><Input name="max_year" defaultValue={f.max_year} placeholder="≤" inputMode="numeric" /></div>
          <Input name="min_tenure" defaultValue={f.min_tenure} placeholder="Owned ≥ yrs" inputMode="numeric" />
          <Select name="owner_type" defaultValue={f.owner_type ?? ""}>
            <option value="">Any owner type</option>
            {["individual", "trust", "llc", "limited_partnership", "partnership", "corporation", "nonprofit", "government", "other", "unknown"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
          <Select name="status" defaultValue={f.status ?? ""}>
            <option value="">Any status</option>
            {["none", "off_market_opportunity", "active_listing", "in_escrow", "sold", "withdrawn"].map((t) => <option key={t} value={t}>{t === "none" ? "Not in play" : label(t)}</option>)}
          </Select>
          <Select name="contacted" defaultValue={f.contacted ?? ""}>
            <option value="">Any outreach</option>
            <option value="never">Never contacted</option>
            <option value="180">Not contacted in 180 days</option>
            <option value="recent">Contacted last 90 days</option>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-ink-700"><input type="checkbox" name="absentee" value="1" defaultChecked={f.absentee === "1"} /> Absentee owner</label>
          <label className="flex items-center gap-1.5 text-xs text-ink-700"><input type="checkbox" name="out_of_state" value="1" defaultChecked={f.out_of_state === "1"} /> Out-of-state</label>
          <input type="hidden" name="sort" value={f.sort ?? ""} />
          <div className="flex gap-1">
            <button className="h-9 flex-1 rounded-md bg-navy-900 px-3 text-sm font-medium text-white">Filter</button>
            <Link href="/properties" className="flex h-9 items-center px-2 text-xs text-ink-500 hover:text-ink-900">Clear</Link>
          </div>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table className="table-compact w-full">
          <thead><tr>
            <th>{sortLink("address", "Address")}</th><th>{sortLink("city", "City")}</th><th className="text-right">{sortLink("units", "Units")}</th>
            <th className="text-right">{sortLink("year", "Built")}</th><th>{sortLink("owner", "Owner of record")}</th>
            <th className="text-right">{sortLink("tenure", "Owned")}</th><th className="text-right">{sortLink("assessed", "Assessed")}</th>
            <th>{sortLink("contacted", "Last outreach")}</th><th>APN</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/properties/${r.id}`} className="font-medium text-navy-800 hover:underline">{r.street_address}</Link>
                  {r.listing_status !== "none" && <Badge tone="green" className="ml-1.5">{label(r.listing_status)}</Badge>}</td>
                <td className="whitespace-nowrap">{r.city} <span className="text-ink-400">{r.zip}</span></td>
                <td className="num text-right">{r.units ?? <span className="text-amber-700" title="Unit count unknown">?</span>}</td>
                <td className="num text-right">{r.year_built ?? "—"}</td>
                <td>{r.owner_entity_id ? <Link href={`/owners/${r.owner_entity_id}`} className="hover:underline">{r.owner_name}</Link> : "—"}
                  <span className="ml-1 text-2xs text-ink-400">{label(r.owner_type)}</span>
                  {r.owner_out_of_state && <Badge tone="navy" className="ml-1">Out of state</Badge>}
                  {!r.owner_out_of_state && r.owner_absentee && <Badge className="ml-1">Absentee</Badge>}</td>
                <td className="num text-right">{r.tenure_years !== null ? `${r.tenure_years}y` : "—"}</td>
                <td className="num text-right">{money(r.assessed_value, { compact: true })}</td>
                <td className="whitespace-nowrap text-ink-500">{r.last_outreach_at ? ago(r.last_outreach_at) : "Never"}</td>
                <td className="whitespace-nowrap font-mono text-2xs text-ink-500">{r.apns}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>No properties match these filters.</Empty>}
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
          <span>Page {page} of {num(pages)}</span>
          <div className="flex gap-2">
            {page > 1 && <ButtonLink size="sm" variant="secondary" href={`/properties${qs(base, { page: String(page - 1) })}`}>Previous</ButtonLink>}
            {page < pages && <ButtonLink size="sm" variant="secondary" href={`/properties${qs(base, { page: String(page + 1) })}`}>Next</ButtonLink>}
          </div>
        </div>
      )}
      <p className="mt-3 text-2xs text-ink-400">Assessed = county land + improvement value (Prop 13 basis, not market value). “Owned” is years since last recorded sale.</p>
    </>
  );
}
