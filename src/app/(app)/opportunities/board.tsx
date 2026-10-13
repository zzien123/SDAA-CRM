"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveOpportunity } from "../actions";
import { cn, date, money } from "@/lib/utils";

type Card = { id: string; name: string; stage_id: string; price: number | null; commission: number; prob: number; next_action: string | null; next_action_date: string | null; party: string | null };
type Stage = { id: string; name: string; kind: string };

export function Board({ stages, cards, today }: { stages: Stage[]; cards: Card[]; today: string }) {
  const [items, setItems] = useState(cards);
  const [over, setOver] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const drop = (stageId: string, id: string) => {
    const prev = items;
    setItems((xs) => xs.map((c) => (c.id === id ? { ...c, stage_id: stageId } : c)));
    start(async () => {
      const r = await moveOpportunity(id, stageId);
      if (!r.ok) { setItems(prev); setErr(r.error); } else router.refresh();
    });
  };
  return (
    <>
      {err && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((s) => {
          const col = items.filter((c) => c.stage_id === s.id);
          const closed = s.kind === "won" || s.kind === "lost";
          return (
            <div key={s.id}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); drop(s.id, e.dataTransfer.getData("text/plain")); }}
              className={cn("flex w-60 shrink-0 flex-col rounded-lg border bg-ink-50", over === s.id ? "border-navy-600 bg-navy-50" : "border-ink-200", closed && "w-44")}>
              <div className="border-b border-ink-200 px-3 py-2">
                <div className="text-xs font-semibold text-ink-900">{s.name} <span className="font-normal text-ink-500">{col.length}</span></div>
                {!closed && <div className="num text-2xs text-ink-500">{money(col.reduce((a, c) => a + (c.price ?? 0), 0), { compact: true })} · {money(col.reduce((a, c) => a + c.commission, 0), { compact: true })} comm.</div>}
              </div>
              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {(closed ? [] : col).map((c) => {
                  const late = c.next_action_date && c.next_action_date < today;
                  return (
                    <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                      className="cursor-grab rounded-md border border-ink-200 bg-white p-2 shadow-sm active:cursor-grabbing">
                      <Link href={`/opportunities/${c.id}`} className="block text-[13px] font-medium leading-tight text-navy-800 hover:underline">{c.name}</Link>
                      {c.party && <div className="truncate text-2xs text-ink-500">{c.party}</div>}
                      <div className="num mt-1 flex justify-between text-2xs text-ink-700"><span>{money(c.price, { compact: true })}</span><span>{money(c.commission, { compact: true })} · {c.prob}%</span></div>
                      {(c.next_action || !c.next_action_date) && (
                        <div className={cn("mt-1 truncate text-2xs", late ? "font-medium text-red-700" : !c.next_action ? "text-amber-700" : "text-ink-500")}>
                          {c.next_action ? `${c.next_action}${c.next_action_date ? " · " + date(c.next_action_date) : ""}` : "No next action"}
                        </div>
                      )}
                    </div>
                  );
                })}
                {closed && <div className="text-center text-2xs text-ink-400">{col.length ? `${col.length} deals — drop here to ${s.kind === "won" ? "close" : "mark lost"}` : `Drop here to ${s.kind === "won" ? "close" : "mark lost"}`}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
