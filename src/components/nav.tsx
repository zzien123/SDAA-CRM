"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Landmark, Target, KanbanSquare, FileSignature, Map, ListChecks,
  BarChart3, Sparkles, Settings, DatabaseZap, Briefcase,
} from "lucide-react";

const NAV: { href: string; label: string; icon: React.ElementType; phase?: string }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/owners", label: "Owners & Contacts", icon: Landmark },
  { href: "/buyers", label: "Buyers", icon: Briefcase },
  { href: "/prospecting", label: "Prospecting", icon: Target },
  { href: "/opportunities", label: "Opportunities", icon: KanbanSquare },
  { href: "/transactions", label: "Transactions", icon: FileSignature, phase: "Phase 4" },
  { href: "/map", label: "Map", icon: Map, phase: "Phase 2" },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/reports", label: "Reports", icon: BarChart3, phase: "Phase 4" },
  { href: "/assistant", label: "AI Assistant", icon: Sparkles, phase: "Phase 3" },
  { href: "/data", label: "Import & Data Quality", icon: DatabaseZap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/owners" && path.startsWith("/contacts")));
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map(({ href, label, icon: Icon, phase }) =>
        phase ? (
          <div key={href} title={`${label} ships in ${phase}`} className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-white/30">
            <Icon size={15} strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
            <span className="text-[10px] uppercase tracking-wide">{phase.replace("Phase ", "P")}</span>
          </div>
        ) : (
          <Link key={href} href={href}
            className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              active(href) ? "bg-white/10 font-medium text-white" : "text-white/70 hover:bg-white/5 hover:text-white")}>
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = NAV.filter((n) => !n.phase).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-200 bg-white lg:hidden">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
          (href === "/" ? path === "/" : path.startsWith(href)) ? "text-navy-900 font-medium" : "text-ink-500")}>
          <Icon size={18} strokeWidth={1.75} />
          {label.split(" ")[0]}
        </Link>
      ))}
    </nav>
  );
}
