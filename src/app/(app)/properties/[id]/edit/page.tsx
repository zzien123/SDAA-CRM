import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PropertyForm } from "@/components/property-form";
export default async function EditProperty({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const [p] = await sql`select * from properties where id = ${id} and org_id = ${s.orgId}`;
  if (!p) notFound();
  return <><PageHeader title={`Edit ${p.street_address}`} /><PropertyForm p={{ ...p }} /></>;
}
