"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

const ITEMS = [
  ["Property", "/properties/new"],
  ["Contact", "/contacts/new"],
  ["Buyer", "/contacts/new?category=investor_buyer"],
  ["Opportunity", "/opportunities/new"],
  ["Task", "/tasks?new=1"],
  ["Import file", "/data/import"],
];

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-navy-900 px-3 text-sm font-medium text-white hover:bg-navy-800">
        <Plus size={15} /> <span className="hidden sm:inline">New</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-md border border-ink-200 bg-white py-1 shadow-lg">
          {ITEMS.map(([l, h]) => (
            <Link key={h} href={h} onClick={() => setOpen(false)} className="block px-3 py-1.5 text-[13px] text-ink-700 hover:bg-ink-50">{l}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
