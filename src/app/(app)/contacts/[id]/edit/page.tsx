import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
export default async function EditContact({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const [c] = await sql`select c.*, co.name as company_name from contacts c left join companies co on co.id = c.company_id where c.id = ${id} and c.org_id = ${s.orgId}`;
  if (!c) notFound();
  const cats = (await sql`select category from contact_categories where contact_id = ${id}`).map((r) => r.category as string);
  return <><PageHeader title={`Edit ${c.full_name}`} /><ContactForm c={{ ...c }} categories={cats} /></>;
}
