"use client";
import { useState } from "react";
import { ActionButton, ActionForm, RecordPicker, Submit } from "@/components/forms";
import { Button, Field, Input, Select } from "@/components/ui";
import { PROPERTY_ROLES } from "@/lib/constants";
import { addParcel, removeParcel, changeOwner, addCoOwner, linkContactToProperty, unlinkPropertyContact } from "../../actions";

export function ParcelAdder({ propertyId }: { propertyId: string }) {
  const [apn, setApn] = useState("");
  return (
    <div className="flex gap-1.5">
      <Input value={apn} onChange={(e) => setApn(e.target.value)} placeholder="Add APN" className="h-7 text-xs" />
      <ActionButton variant="secondary" run={async () => { const r = await addParcel(propertyId, apn); if (r.ok) setApn(""); return r; }}>Add</ActionButton>
    </div>
  );
}
export function RemoveParcel({ id }: { id: string }) {
  return <ActionButton run={() => removeParcel(id)} confirm="Remove APN?" className="h-5 px-1 text-2xs text-ink-400">✕</ActionButton>;
}

const CONF = [["public_record", "Public record (deed, assessor, SOS)"], ["reported", "Reported (owner/agent told me)"], ["verified", "Verified (documents reviewed)"], ["unverified", "Unverified"]];

export function ChangeOwnerForm({ propertyId }: { propertyId: string }) {
  return (
    <ActionForm action={changeOwner} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="property_id" value={propertyId} />
      <Field label="Existing owner"><RecordPicker name="entity_id" kind="entity" placeholder="Search owners…" /></Field>
      <Field label="…or new owner name"><Input name="new_entity_name" placeholder="e.g. Pacific Coast Holdings LLC" /></Field>
      <Field label="Sale / transfer date"><Input type="date" name="start_date" /></Field>
      <Field label="Ownership %"><Input name="ownership_pct" placeholder="100" inputMode="decimal" /></Field>
      <Field label="Source" className="sm:col-span-2"><Input name="source" required placeholder="e.g. Grant deed doc #2026-0123456; title report" /></Field>
      <Field label="Confidence"><Select name="confidence" defaultValue="public_record">{CONF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <div className="flex items-end"><Submit>Record ownership change</Submit></div>
      <p className="text-2xs text-ink-500 sm:col-span-2">The current owner is moved to ownership history with an end date. Nothing is deleted.</p>
    </ActionForm>
  );
}

export function AddCoOwnerForm({ propertyId }: { propertyId: string }) {
  return (
    <ActionForm action={addCoOwner} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="property_id" value={propertyId} />
      <Field label="Owner entity"><RecordPicker name="entity_id" kind="entity" placeholder="Search owners…" /></Field>
      <Field label="Role"><Select name="vesting_role" defaultValue="co_owner"><option value="co_owner">Co-owner (TIC / partial)</option><option value="second_name_on_title">Second name on title</option></Select></Field>
      <Field label="Ownership %"><Input name="ownership_pct" inputMode="decimal" /></Field>
      <Field label="Confidence"><Select name="confidence" defaultValue="public_record">{CONF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Source" className="sm:col-span-2"><Input name="source" required /></Field>
      <div><Submit>Add co-owner</Submit></div>
    </ActionForm>
  );
}


export function LinkContactForm({ propertyId }: { propertyId: string }) {
  return (
    <ActionForm action={linkContactToProperty} className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
      <input type="hidden" name="property_id" value={propertyId} />
      <RecordPicker name="contact_id" kind="contact" placeholder="Search contacts…" />
      <Select name="role" defaultValue="property_manager">{PROPERTY_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      <Submit>Link</Submit>
    </ActionForm>
  );
}
export function UnlinkContact({ id }: { id: string }) {
  return <ActionButton run={() => unlinkPropertyContact(id)} confirm="Unlink?" className="h-5 px-1 text-2xs text-ink-400">Unlink</ActionButton>;
}
export { Button };
