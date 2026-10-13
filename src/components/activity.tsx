"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionForm, ActionButton, Submit } from "./forms";
import { Input, Select, Textarea, Badge } from "./ui";
import { logActivity, deleteActivity, createTask, setTaskStatus } from "@/app/(app)/actions";
import { ago, date, label, cn } from "@/lib/utils";
import { Phone, Mail, MessageSquare, FileText, Users, MapPin, StickyNote, ArrowRightLeft, Check } from "lucide-react";

type Links = { property_id?: string; contact_id?: string; entity_id?: string; opportunity_id?: string };

const OUTCOMES = [
  ["", "—"], ["no_answer", "No answer"], ["left_voicemail", "Left voicemail"], ["conversation", "Conversation"],
  ["meaningful_conversation", "Meaningful conversation"], ["open_to_selling", "Open to selling"], ["meeting_set", "Meeting set"],
  ["not_interested", "Not interested"], ["wrong_number", "Wrong number"], ["sent", "Sent"],
];

function Hidden({ links }: { links: Links }) {
  return <>{Object.entries(links).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}</>;
}

export function LogActivity({ links }: { links: Links }) {
  const [type, setType] = useState("call");
  const types = [["call", "Call", Phone], ["email", "Email", Mail], ["text", "Text", MessageSquare], ["letter", "Letter", FileText], ["meeting", "Meeting", Users], ["in_person", "Drop-in", MapPin], ["note", "Note", StickyNote]] as const;
  return (
    <ActionForm action={logActivity} className="space-y-2.5">
      <Hidden links={links} />
      <input type="hidden" name="type" value={type} />
      <div className="flex flex-wrap gap-1">
        {types.map(([v, l, Icon]) => (
          <button type="button" key={v} onClick={() => setType(v)}
            className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs", type === v ? "border-navy-900 bg-navy-900 text-white" : "border-ink-200 text-ink-700 hover:bg-ink-50")}>
            <Icon size={12} /> {l}
          </button>
        ))}
      </div>
      <Textarea name="body" placeholder={type === "note" ? "Note…" : "What happened? What did they say? Any commitments?"} rows={3} />
      {type !== "note" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Select name="direction" defaultValue="outbound"><option value="outbound">Outbound</option><option value="inbound">Inbound</option></Select>
          <Select name="outcome" defaultValue="">{OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Input type="datetime-local" name="occurred_at" title="When (defaults to now)" />
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_150px_auto]">
        <Input name="follow_up_title" placeholder="Follow-up (optional), e.g. Call back re: loan maturity" className="col-span-2 sm:col-span-1" />
        <Input type="date" name="follow_up_date" title="Follow-up date" />
        <Submit size="md">Log</Submit>
      </div>
      <label className="flex items-center gap-1.5 text-2xs text-ink-500"><input type="checkbox" name="is_private" /> Private note</label>
    </ActionForm>
  );
}

const ICON: Record<string, React.ElementType> = { call: Phone, email: Mail, text: MessageSquare, letter: FileText, meeting: Users, in_person: MapPin, note: StickyNote, status_change: ArrowRightLeft, system: ArrowRightLeft, document: FileText };

export type TimelineItem = {
  id: string; type: string; direction: string | null; outcome: string | null; subject: string | null; body: string | null; occurred_at: string | Date;
  property_id: string | null; street_address: string | null; contact_id: string | null; contact_name: string | null;
  entity_id: string | null; entity_name: string | null; opportunity_id: string | null; opp_name: string | null; is_private: boolean; author: string | null;
};

export function Timeline({ items, context }: { items: TimelineItem[]; context: "property" | "contact" | "entity" | "opportunity" | "dashboard" }) {
  if (!items.length) return <p className="px-1 py-3 text-[13px] text-ink-500">No activity logged yet.</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const Icon = ICON[a.type] ?? StickyNote;
        const refs: [string, string][] = [];
        if (a.property_id && context !== "property") refs.push([a.street_address ?? "Property", `/properties/${a.property_id}`]);
        if (a.entity_id && context !== "entity") refs.push([a.entity_name ?? "Owner", `/owners/${a.entity_id}`]);
        if (a.contact_id && context !== "contact") refs.push([a.contact_name ?? "Contact", `/contacts/${a.contact_id}`]);
        if (a.opportunity_id && context !== "opportunity") refs.push([a.opp_name ?? "Deal", `/opportunities/${a.opportunity_id}`]);
        return (
          <li key={a.id} className="group flex gap-2.5">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500"><Icon size={12} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-500">
                <span className="font-medium text-ink-700">{a.subject ?? label(a.type)}{a.direction === "inbound" ? " (inbound)" : ""}</span>
                {a.outcome && <Badge tone={a.outcome === "open_to_selling" ? "green" : a.outcome === "not_interested" ? "red" : "gray"}>{label(a.outcome)}</Badge>}
                {a.is_private && <Badge tone="amber">Private</Badge>}
                <span title={new Date(a.occurred_at).toLocaleString()}>{date(a.occurred_at as string)} · {ago(a.occurred_at as string)}</span>
                {refs.map(([l, h]) => <Link key={h} href={h} className="text-navy-700 hover:underline">{l}</Link>)}
                {a.type !== "status_change" && (
                  <span className="opacity-0 group-hover:opacity-100"><ActionButton run={() => deleteActivity(a.id)} confirm="Delete?" className="h-5 px-1 text-2xs">Delete</ActionButton></span>
                )}
              </div>
              {a.body && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-900">{a.body}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const TASK_TYPES = [
  ["custom", "Custom"], ["call_owner", "Call owner"], ["follow_up_buyer", "Follow up with buyer"], ["send_financials", "Send financials"],
  ["request_rent_roll", "Request rent roll"], ["prepare_valuation", "Prepare valuation"], ["schedule_tour", "Schedule tour"],
  ["submit_offer", "Submit offer"], ["review_documents", "Review documents"], ["transaction_deadline", "Transaction deadline"],
];

export function NewTask({ links, compact }: { links: Links; compact?: boolean }) {
  return (
    <ActionForm action={createTask} className="space-y-2">
      <Hidden links={links} />
      <div className={cn("grid gap-2", compact ? "grid-cols-[1fr_130px_auto]" : "grid-cols-1 sm:grid-cols-[1fr_170px_140px_100px_auto]")}>
        <Input name="title" placeholder="Task…" required />
        {!compact && <Select name="type" defaultValue="custom">{TASK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}
        <Input type="date" name="due_date" />
        {!compact && <Select name="priority" defaultValue="2"><option value="1">High</option><option value="2">Normal</option><option value="3">Low</option></Select>}
        {!compact && <Input name="recurrence_days" placeholder="Repeat (days)" inputMode="numeric" />}
        <Submit>Add</Submit>
      </div>
    </ActionForm>
  );
}

export type TaskRow = {
  id: string; title: string; type: string; due_date: string | null; priority: number; status: string; notes: string | null; recurrence_days: number | null;
  property_id: string | null; street_address: string | null; contact_id: string | null; contact_name: string | null;
  entity_id: string | null; entity_name: string | null; opportunity_id: string | null; opp_name: string | null;
};

export function TaskList({ tasks, showLinks = true }: { tasks: TaskRow[]; showLinks?: boolean }) {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (!tasks.length) return <p className="px-1 py-2 text-[13px] text-ink-500">No open tasks.</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {tasks.map((t) => {
        const overdue = t.due_date && t.due_date < todayStr;
        return (
          <li key={t.id} className="flex items-start gap-2 py-2">
            <ActionButton run={() => setTaskStatus(t.id, "done")} title="Mark done" className="mt-0.5 h-4 w-4 rounded border border-ink-300 p-0 hover:border-navy-700 hover:bg-navy-50">
              <Check size={10} className="opacity-0 hover:opacity-100" />
            </ActionButton>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] text-ink-900">{t.title}</span>
                {t.priority === 1 && <Badge tone="red">High</Badge>}
                {t.recurrence_days && <Badge>every {t.recurrence_days}d</Badge>}
              </div>
              <div className="flex flex-wrap gap-x-2 text-2xs text-ink-500">
                <span className={overdue ? "font-medium text-red-700" : ""}>{t.due_date ? (overdue ? "Overdue · " : "") + date(t.due_date) : "No date"}</span>
                {t.type !== "custom" && <span>{label(t.type)}</span>}
                {showLinks && t.street_address && <Link className="text-navy-700 hover:underline" href={`/properties/${t.property_id}`}>{t.street_address}</Link>}
                {showLinks && t.entity_name && <Link className="text-navy-700 hover:underline" href={`/owners/${t.entity_id}`}>{t.entity_name}</Link>}
                {showLinks && t.contact_name && <Link className="text-navy-700 hover:underline" href={`/contacts/${t.contact_id}`}>{t.contact_name}</Link>}
                {showLinks && t.opp_name && <Link className="text-navy-700 hover:underline" href={`/opportunities/${t.opportunity_id}`}>{t.opp_name}</Link>}
              </div>
            </div>
            <ActionButton run={() => setTaskStatus(t.id, "canceled")} confirm="Cancel task?" className="h-6 px-1.5 text-2xs text-ink-400">✕</ActionButton>
          </li>
        );
      })}
    </ul>
  );
}
