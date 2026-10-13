import { PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
export default async function NewContact({ searchParams }: { searchParams: Promise<{ category?: string; link_property_id?: string }> }) {
  const sp = await searchParams;
  return <><PageHeader title={sp.category === "investor_buyer" ? "New buyer" : "New contact"} sub={sp.category === "investor_buyer" ? "Create the person first, then add acquisition criteria on their profile." : undefined} />
    <ContactForm c={null} categories={sp.category ? [sp.category] : []} linkPropertyId={sp.link_property_id} /></>;
}
