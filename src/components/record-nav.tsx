"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Previous / Next through the list you came from. ← and → keys work too (unless you're typing). */
export function RecordNav({ prev, next, center }: { prev: string | null; next: string | null; center: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || t.closest("input, textarea, select, [contenteditable=true], .leaflet-container")) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev);
      if (e.key === "ArrowRight" && next) router.push(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);
  const btn = "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium";
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      {prev
        ? <Link href={prev} className={cn(btn, "border-ink-200 bg-white text-ink-800 hover:bg-ink-50")} title="Previous (←)"><ChevronLeft size={14} /> Previous</Link>
        : <span className={cn(btn, "border-ink-100 text-ink-300")}><ChevronLeft size={14} /> Previous</span>}
      <div className="truncate text-center text-2xs text-ink-500">{center}</div>
      {next
        ? <Link href={next} className={cn(btn, "border-navy-900 bg-navy-900 text-white hover:bg-navy-800")} title="Next (→)">Next <ChevronRight size={14} /></Link>
        : <span className={cn(btn, "border-ink-100 text-ink-300")}>Next <ChevronRight size={14} /></span>}
    </div>
  );
}
