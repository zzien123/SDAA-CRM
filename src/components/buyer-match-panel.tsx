"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "./ui";
import { createBuyerOutreach } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

type M = {
  id: string; name: string; company: string | null; email: string | null; dnc: boolean; lastContact: string | null;
  label: string; score: number; tier: string; matches: string[]; conflicts: string[]; unknowns: string[]; notes: string[];
};

export function BuyerMatchPanel({ items, propertyId, opportunityId, address }: { items: M[]; propertyId: string; opportunityId?: string | null; address: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const visible = showAll ? items : items.filter((i) => i.tier !== "conflict").slice(0, 10);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const emails = items.filter((i) => sel.has(i.id) && i.email).map((i) => i.email!);
  return (
    <div>
      <ul className="divide-y divide-ink-100">
        {visible.map((m) => (
          <li key={m.id} className="flex gap-2 px-4 py-2.5">
            <input type="checkbox" className="mt-1" disabled={m.dnc} checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <Link href={`/contacts/${m.id}`} className="font-medium text-navy-800 hover:underline">{m.name}</Link>
                {m.company && <span className="text-2xs text-ink-500">{m.company}</span>}
                <Badge tone={m.tier === "strong" ? "green" : m.tier === "possible" ? "navy" : m.tier === "conflict" ? "red" : "gray"}>{m.tier === "conflict" ? "Conflict" : `${m.score}`}</Badge>
                <span className="text-2xs text-ink-400">{m.label}</span>
                {m.dnc && <Badge tone="red">DNC</Badge>}
              </div>
              {m.matches.length > 0 && <div className="text-2xs text-emerald-800">✓ {m.matches.join(" · ")}</div>}
              {m.conflicts.length > 0 && <div className="text-2xs text-red-700">✗ {m.conflicts.join(" · ")}</div>}
              {m.notes.length > 0 && <div className="text-2xs text-amber-800">! {m.notes.join(" · ")}</div>}
              {m.unknowns.length > 0 && <div className="text-2xs text-ink-400">Unknown: {m.unknowns.join(", ")}</div>}
            </div>
          </li>
        ))}
      </ul>
      {!visible.length && <p className="px-4 py-4 text-[13px] text-ink-500">No buyers fit on known criteria. {items.length > 0 && "Show conflicts to see near misses."}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-3">
        <Button size="sm" disabled={!sel.size || pending} onClick={() => start(async () => {
          const r = await createBuyerOutreach(propertyId, opportunityId ?? null, [...sel]);
          if (r.ok) { setMsg(`${sel.size} follow-up task${sel.size > 1 ? "s" : ""} created`); setSel(new Set()); router.refresh(); } else setMsg(r.error);
        })}>Create outreach tasks ({sel.size})</Button>
        {emails.length > 0 && <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(emails.join(", ")); setMsg(`${emails.length} emails copied for BCC`); }}>Copy emails</Button>}
        <button className={cn("text-2xs text-navy-700 hover:underline")} onClick={() => setShowAll((s) => !s)}>{showAll ? "Hide conflicts" : `Show all ${items.length} incl. conflicts`}</button>
        {msg && <span className="text-2xs text-ink-600">{msg}</span>}
      </div>
      <p className="px-4 pb-3 text-2xs text-ink-400">Scores count only preferences the buyer has told you. Opted-out emails are excluded. Tasks: “Send {address}”.</p>
    </div>
  );
}
