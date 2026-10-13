"use client";
import { ActionForm, RecordPicker, Submit } from "./forms";
import { Card, Field, Input, Select, Textarea } from "./ui";
import { saveOpportunity } from "@/app/(app)/actions";

type O = Record<string, unknown> | null;
const v = (o: O, k: string, pctField = false) => {
  const x = o?.[k];
  if (x === null || x === undefined) return "";
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (pctField) return String(+(Number(x) * 100).toFixed(3));
  return String(x);
};

export function OpportunityForm({ o, stages, labels, defaults }: {
  o: O; stages: { id: string; name: string; default_probability: number }[];
  labels: { property?: string | null; seller_contact?: string | null; seller_entity?: string | null; buyer_contact?: string | null };
  defaults: { default_commission_rate: number; default_brokerage_split: number };
}) {
  return (
    <ActionForm action={saveOpportunity} resetOnSuccess={false} className="space-y-4">
      {o?.id ? <input type="hidden" name="id" value={String(o.id)} /> : null}
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Deal name *" className="sm:col-span-2"><Input name="name" required defaultValue={v(o, "name") || labels.property || ""} /></Field>
        <Field label="Stage"><Select name="stage_id" defaultValue={v(o, "stage_id") || stages[0]?.id}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Our side"><Select name="side" defaultValue={v(o, "side") || "seller"}><option value="seller">Seller (listing)</option><option value="buyer">Buyer</option><option value="dual">Dual</option></Select></Field>
        <Field label="Property" className="sm:col-span-2"><RecordPicker name="property_id" kind="property" defaultValue={v(o, "property_id")} defaultLabel={labels.property} placeholder="Search properties…" /></Field>
        <Field label="Seller entity"><RecordPicker name="seller_entity_id" kind="entity" defaultValue={v(o, "seller_entity_id")} defaultLabel={labels.seller_entity} placeholder="Owner of record…" /></Field>
        <Field label="Seller contact"><RecordPicker name="seller_contact_id" kind="contact" defaultValue={v(o, "seller_contact_id")} defaultLabel={labels.seller_contact} placeholder="Decision maker…" /></Field>
        <Field label="Buyer contact"><RecordPicker name="buyer_contact_id" kind="contact" defaultValue={v(o, "buyer_contact_id")} defaultLabel={labels.buyer_contact} placeholder="Buyer…" /></Field>
        <Field label="Deal source"><Input name="deal_source" defaultValue={v(o, "deal_source")} placeholder="Cold call, referral, mailer…" /></Field>
      </Card>
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Asking price $"><Input name="asking_price" defaultValue={v(o, "asking_price")} inputMode="decimal" /></Field>
        <Field label="Expected price $"><Input name="expected_price" defaultValue={v(o, "expected_price")} inputMode="decimal" /></Field>
        <Field label="Probability %" hint="Blank = stage default"><Input name="probability" defaultValue={v(o, "probability")} inputMode="decimal" /></Field>
        <Field label="Expected close"><Input type="date" name="expected_close_date" defaultValue={v(o, "expected_close_date")} /></Field>
        <Field label="Commission %" hint={`Blank = default ${(defaults.default_commission_rate * 100).toFixed(2)}%`}><Input name="commission_rate" defaultValue={v(o, "commission_rate", true)} inputMode="decimal" /></Field>
        <Field label="Your split %" hint={`Blank = default ${(defaults.default_brokerage_split * 100).toFixed(0)}%`}><Input name="brokerage_split" defaultValue={v(o, "brokerage_split", true)} inputMode="decimal" /></Field>
        <Field label="Next action" className="sm:col-span-2"><Input name="next_action" defaultValue={v(o, "next_action")} /></Field>
        <Field label="Next action date"><Input type="date" name="next_action_date" defaultValue={v(o, "next_action_date")} /></Field>
        <Field label="Lost reason"><Input name="lost_reason" defaultValue={v(o, "lost_reason")} /></Field>
        <Field label="Notes" className="sm:col-span-4"><Textarea name="notes" defaultValue={v(o, "notes")} /></Field>
      </Card>
      <Submit>{o?.id ? "Save deal" : "Create opportunity"}</Submit>
    </ActionForm>
  );
}
