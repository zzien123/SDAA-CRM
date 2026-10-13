"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type Hit = { kind: string; id: string; title: string; sub: string | null; href: string };

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, { signal: ctl.signal });
        if (r.ok) { setHits((await r.json()).hits); setIdx(0); setOpen(true); }
      } catch { /* aborted */ }
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return (
    <form className="relative w-full max-w-xl" onSubmit={(e) => {
      e.preventDefault();
      setOpen(false);
      if (hits[idx] && open) router.push(hits[idx].href); else if (q.trim()) router.push(`/search?q=${encodeURIComponent(q)}`);
    }}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search address, APN, owner, person, phone, deal…  ⌘K"
        className="h-9 w-full rounded-md border border-ink-200 bg-ink-50 pl-8 pr-3 text-sm placeholder:text-ink-400 focus:border-navy-600 focus:bg-white focus:outline-none" />
      {open && hits.length > 0 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
          {hits.map((h, i) => (
            <button type="button" key={h.kind + h.id} onMouseDown={() => router.push(h.href)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${i === idx ? "bg-navy-50" : ""}`}>
              <span className="w-16 shrink-0 text-2xs uppercase tracking-wide text-ink-400">{h.kind}</span>
              <span className="truncate text-[13px] text-ink-900">{h.title}</span>
              {h.sub && <span className="truncate text-2xs text-ink-500">{h.sub}</span>}
            </button>
          ))}
          <button type="submit" className="block w-full border-t border-ink-100 px-3 py-1.5 text-left text-2xs text-navy-700 hover:bg-ink-50">See all results for “{q}”</button>
        </div>
      )}
    </form>
  );
}
