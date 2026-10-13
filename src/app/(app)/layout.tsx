import { requireSession } from "@/lib/auth";
import { Nav, MobileNav } from "@/components/nav";
import { QuickAdd } from "@/components/quick-add";
import { SearchBox } from "@/components/search-box";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <div className="min-h-screen lg:pl-56">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col bg-navy-950 py-4 lg:flex">
        <div className="mb-5 px-4">
          <div className="text-[13px] font-semibold tracking-tight text-white">San Diego Apartment Advisors</div>
          <div className="text-2xs text-white/40">Brokerage CRM</div>
        </div>
        <Nav />
        <div className="mt-auto px-4 text-2xs text-white/40">
          <div className="truncate">{s.email}</div>
          <form action="/auth/signout" method="post"><button className="mt-1 text-white/60 hover:text-white">Sign out</button></form>
        </div>
      </aside>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/95 px-4 backdrop-blur lg:px-6">
        <SearchBox />
        <div className="ml-auto"><QuickAdd /></div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 lg:px-6 lg:pb-10">{children}</main>
      <MobileNav />
    </div>
  );
}
