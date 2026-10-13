"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { addSuppression, archiveProspectList, createProspectList, logProspectOutcome, refreshProspectList, removeSuppression, setEntityDnc, setOwnerInList } from "./actions";

export function NewListForm({ filters, defaultName, compact }: { filters: Record<string, string | undefined>; defaultName?: string; compact?: boolean }) {
  const clean = Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && !["page", "sort", "dir"].includes(k)));
  return (
    <ActionForm action={createProspectList} className={cn("grid gap-2", compact ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]")}>
      <input type="hidden" name="filters" value={JSON.stringify(clean)} />
      <Input name="name" required defaultValue={defaultName} placeholder="List name, e.g. North Park 10+ units, 20+ yr owners" />
      {!compact && <Input name="description" placeholder="Why this list (optional)" />}
      <Submit>Save as prospect list</Submit>
    </ActionForm>
  );
}

export function ListAdmin({ id, archived }: { id: string; archived: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-1">
      <ActionButton variant="secondary" run={async () => { const r = await refreshProspectList(id); if (r.ok) setMsg(`${r.id} added`); return r; }}>Add new matches</ActionButton>
      <ActionButton run={() => archiveProspectList(id, !archived)}>{archived ? "Unarchive" : "Archive"}</ActionButton>
      {msg && <span className="text-2xs text-ink-500">{msg}</span>}
    </span>
  );
}

const OUT: [string, string, string][] = [
  ["no_answer", "No answer", "gray"], ["left_voicemail", "Left VM", "gray"], ["sent", "Sent", "gray"], ["wrong_number", "Wrong #", "gray"],
  ["conversation", "Talked — not now", "navy"], ["meaningful_conversation", "Good conversation", "navy"],
  ["open_to_selling", "Open to selling", "green"], ["meeting_set", "Meeting set", "green"],
  ["not_interested", "Not interested", "amber"], ["do_not_contact", "Do not contact", "red"],
];

export function OutcomeForm({ listId, entityId, people }: { listId: string; entityId: string; people: { id: string; name: string }[] }) {
  const [outcome, setOutcome] = useState("");
  const router = useRouter();
  return (
    <ActionForm action={logProspectOutcome} onDone={() => router.push(`/prospecting/${listId}`)} className="space-y-3">
      <input type="hidden" name="list_id" value={listId} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="outcome" value={outcome} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Channel">
          <Select name="channel" defaultValue="call"><option value="call">Call</option><option value="letter">Letter</option><option value="email">Email</option><option value="text">Text</option><option value="in_person">In person</option></Select>
        </Field>
        <Field label="Spoke with / addressed to">
          <Select name="contact_id" defaultValue=""><option value="">Owner of record</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
      </div>
      <div>
        <span className="field-label">Outcome</span>
        <div className="flex flex-wrap gap-1.5">
          {OUT.map(([v, l, tone]) => (
            <button type="button" key={v} onClick={() => setOutcome(v)}
              className={cn("rounded-md border px-2.5 py-1.5 text-xs font-medium",
                outcome === v ? "border-navy-900 bg-navy-900 text-white"
                  : tone === "green" ? "border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                  : tone === "red" ? "border-red-200 text-red-700 hover:bg-red-50"
                  : tone === "amber" ? "border-amber-200 text-amber-800 hover:bg-amber-50"
                  : "border-ink-200 text-ink-700 hover:bg-ink-50")}>{l}</button>
          ))}
        </div>
      </div>
      <Textarea name="body" rows={3} placeholder="Notes: what they said, timing, loan, partners, what they'd need to sell…" />
      <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
        <Input name="next_action" placeholder="Next action (default: Follow up)" />
        <Input type="date" name="next_action_date" title="Override the default follow-up date" />
      </div>
      {outcome === "do_not_contact" && <Input name="dnc_reason" placeholder="Reason (e.g. asked to be removed)" />}
      <div className="flex items-center gap-3">
        <Submit>{outcome ? "Log & next owner" : "Pick an outcome"}</Submit>
        <span className="text-2xs text-ink-500">Default follow-up: no answer 3d · VM 4d · talked 30–90d · interested 7d · not interested 180d</span>
      </div>
    </ActionForm>
  );
}

export function OwnerControls({ listId, entityId, priority }: { listId: string; entityId: string; priority: number }) {
  const router = useRouter();
  return (
    <span className="flex flex-wrap items-center gap-1">
      <select defaultValue={priority} onChange={async (e) => { await setOwnerInList(listId, entityId, { priority: Number(e.target.value) }); router.refresh(); }}
        className="h-7 rounded border border-ink-200 bg-white px-1 text-xs">
        <option value={1}>High priority</option><option value={2}>Normal</option><option value={3}>Low</option>
      </select>
      <ActionButton variant="secondary" run={async () => { const r = await setOwnerInList(listId, entityId, { status: "skipped" }); if (r.ok) router.push(`/prospecting/${listId}`); return r; }}>Skip</ActionButton>
    </span>
  );
}

export function DncToggle({ entityId, on }: { entityId: string; on: boolean }) {
  return on
    ? <ActionButton variant="secondary" run={() => setEntityDnc(entityId, false)} confirm="Allow contact again?">Remove do-not-contact</ActionButton>
    : <ActionButton variant="danger" run={() => setEntityDnc(entityId, true, "Marked manually")} confirm="Mark do-not-contact?">Do not contact</ActionButton>;
}

export function SuppressionForm() {
  return (
    <ActionForm action={addSuppression} className="grid gap-2 sm:grid-cols-[110px_1fr_200px_auto]">
      <Select name="kind"><option value="phone">Phone</option><option value="email">Email</option></Select>
      <Input name="value" required placeholder="Number or email" />
      <Select name="reason"><option value="opt_out">Opted out</option><option value="do_not_contact">Do not contact</option><option value="wrong_number">Wrong number</option><option value="dnc_registry">On DNC registry</option></Select>
      <Submit>Suppress</Submit>
    </ActionForm>
  );
}
export function RemoveSuppression({ id }: { id: string }) {
  return <ActionButton run={() => removeSuppression(id)} confirm="Remove?" className="h-6 px-1.5 text-2xs">Remove</ActionButton>;
}
export { Button };
