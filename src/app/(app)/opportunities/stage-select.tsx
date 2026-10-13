"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveOpportunity } from "../actions";

export function StageSelect({ id, value, stages }: { id: string; value: string; stages: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select disabled={pending} defaultValue={value} onChange={(e) => start(async () => { await moveOpportunity(id, e.target.value); router.refresh(); })}
      className="h-7 rounded border border-ink-200 bg-white px-1 text-xs">
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
