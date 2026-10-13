import Link from "next/link";
import { cn } from "@/lib/utils";
export function OwnerTabs({ active }: { active: "owners" | "contacts" }) {
  const t = (key: string, href: string, text: string) => (
    <Link href={href} className={cn("border-b-2 px-1 pb-2 text-sm", active === key ? "border-navy-900 font-medium text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}>{text}</Link>
  );
  return <div className="mb-4 flex gap-5 border-b border-ink-200">{t("owners", "/owners", "Owners of record (entities)")}{t("contacts", "/contacts", "People & companies")}</div>;
}
