import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { orgSettings, stages } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { OpportunityForm } from "@/components/opportunity-form";

export default async function NewOpp({ searchParams }: { searchParams: Promise<{ property_id?: string; seller_entity_id?: string; prospect_list_id?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const uuid = (x?: string) => (x && /^[0-9a-f-]{36}$/.test(x) ? x : null);
  const [st, defaults, [p], [e]] = await Promise.all([
    stages(s.orgId), orgSettings(s.orgId),
    uuid(sp.property_id) ? sql`select id, street_address from properties where id = ${sp.property_id!} and org_id = ${s.orgId}` : Promise.resolve([] as never[]),
    uuid(sp.seller_entity_id) ? sql`select id, name from entities where id = ${sp.seller_entity_id!} and org_id = ${s.orgId}` : Promise.resolve([] as never[]),
  ]);
  return (
    <>
      <PageHeader title="New opportunity" />
      <OpportunityForm o={p || e ? { property_id: p?.id ?? null, seller_entity_id: e?.id ?? null, prospect_list_id: uuid(sp.prospect_list_id), deal_source: sp.prospect_list_id ? "Prospecting list" : null } as never : null}
        stages={st as never} defaults={defaults} labels={{ property: p?.street_address, seller_entity: e?.name }} />
    </>
  );
}
