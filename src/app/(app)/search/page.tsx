import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { searchAll } from "@/lib/search";
import { Card, CardHeader, Empty, PageHeader } from "@/components/ui";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession();
  const { q = "" } = await searchParams;
  const hits = q ? await searchAll(s.orgId, q, 25) : [];
  const groups = ["deal", "contact", "property", "owner", "company"] as const;
  const names = { deal: "Opportunities", contact: "People", property: "Properties", owner: "Owners (entities)", company: "Companies" };
  return (
    <>
      <PageHeader title={`Results for “${q}”`} sub={`${hits.length} matches`} />
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const list = hits.filter((h) => h.kind === g);
          if (!list.length) return null;
          return (
            <Card key={g}>
              <CardHeader title={names[g]} sub={`${list.length}${list.length === 25 ? "+" : ""}`} />
              <ul>
                {list.map((h) => (
                  <li key={h.id} className="border-b border-ink-100 last:border-0">
                    <Link href={h.href} className="block px-4 py-2 hover:bg-ink-50">
                      <div className="text-[13px] font-medium text-ink-900">{h.title}</div>
                      {h.sub && <div className="text-2xs text-ink-500">{h.sub}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {!hits.length && <Card><Empty>Nothing matches. Try part of an address, an APN, an owner name or a phone number.</Empty></Card>}
    </>
  );
}
