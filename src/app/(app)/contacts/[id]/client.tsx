"use client";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Input, Select } from "@/components/ui";
import { addContactMethod, toggleContactMethodFlag } from "../../actions";

export function AddMethod({ contactId }: { contactId: string }) {
  return (
    <ActionForm action={addContactMethod} className="grid grid-cols-[90px_1fr_auto] gap-1.5">
      <input type="hidden" name="contact_id" value={contactId} />
      <Select name="kind" className="h-7 text-xs"><option value="phone">Phone</option><option value="email">Email</option></Select>
      <Input name="value" className="h-7 text-xs" placeholder="Number or email" required />
      <Submit size="sm" variant="secondary">Add</Submit>
    </ActionForm>
  );
}
export function FlagToggle({ kind, id, contactId, on }: { kind: "phone" | "email"; id: string; contactId: string; on: boolean }) {
  return <ActionButton run={() => toggleContactMethodFlag(kind, id, contactId)} className="h-5 px-1 text-2xs text-ink-400">{on ? "Allow" : kind === "phone" ? "Mark DNC" : "Opt out"}</ActionButton>;
}
