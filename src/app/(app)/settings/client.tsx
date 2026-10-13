"use client";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui";
import { saveSettings, saveStage } from "../actions";

export function CommissionForm({ rate, split }: { rate: number; split: number }) {
  return (
    <ActionForm action={saveSettings} resetOnSuccess={false} successMessage="Saved" className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <Field label="Default commission %"><Input name="default_commission_rate" defaultValue={+(rate * 100).toFixed(3)} inputMode="decimal" /></Field>
      <Field label="Your split %" hint="Your share after the house split"><Input name="default_brokerage_split" defaultValue={+(split * 100).toFixed(2)} inputMode="decimal" /></Field>
      <div><Submit>Save</Submit></div>
    </ActionForm>
  );
}
export function StageRow({ id, name, prob }: { id: string; name: string; prob: number }) {
  return (
    <ActionForm action={saveStage} resetOnSuccess={false} className="grid grid-cols-[1fr_90px_auto] gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="name" defaultValue={name} className="h-8" />
      <Input name="default_probability" defaultValue={prob} className="h-8" inputMode="decimal" title="Default probability %" />
      <Submit size="sm" variant="secondary">Save</Submit>
    </ActionForm>
  );
}
export function NewStage() {
  return (
    <ActionForm action={saveStage} className="grid grid-cols-[1fr_90px_140px_auto] gap-2">
      <Input name="name" placeholder="New stage name" className="h-8" required />
      <Input name="default_probability" placeholder="%" className="h-8" inputMode="decimal" />
      <Select name="kind" className="h-8"><option value="open">Open</option><option value="under_contract">Under contract</option></Select>
      <Submit size="sm">Add</Submit>
    </ActionForm>
  );
}
