"use client";
import { ActionButton, ActionForm, RecordPicker, Submit } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { linkPersonToEntity, promoteCareOf, saveEntity, unlinkEntityPerson } from "../../actions";
import { label } from "@/lib/utils";

export const ROLES = ["beneficial_owner", "managing_member", "member", "general_partner", "limited_partner", "trustee", "beneficiary", "officer", "authorized_representative", "registered_agent", "in_care_of", "other"];

export function LinkPersonForm({ entityId }: { entityId: string }) {
  return (
    <ActionForm action={linkPersonToEntity} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="entity_id" value={entityId} />
      <Field label="Existing contact"><RecordPicker name="contact_id" kind="contact" placeholder="Search people…" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="…or new: first"><Input name="first_name" /></Field>
        <Field label="last"><Input name="last_name" /></Field>
      </div>
      <Field label="Role">
        <Select name="role" defaultValue="managing_member">{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</Select>
      </Field>
      <Field label="Makes sale decisions?">
        <Select name="is_decision_maker" defaultValue="unknown"><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></Select>
      </Field>
      <Field label="Source / evidence" className="sm:col-span-2"><Input name="source" required placeholder="e.g. CA SOS Statement of Information filed 3/2025; trust cert in escrow file" /></Field>
      <Field label="Confidence">
        <Select name="confidence" defaultValue="public_record">
          <option value="public_record">Public record</option><option value="reported">Reported</option><option value="verified">Verified</option><option value="unverified">Unverified</option>
        </Select>
      </Field>
      <Field label="Ownership %"><Input name="ownership_pct" inputMode="decimal" /></Field>
      <Field label="Notes" className="sm:col-span-2"><Input name="notes" /></Field>
      <div><Submit>Link person</Submit></div>
      <p className="text-2xs text-ink-500 sm:col-span-2">A registered agent is not an owner. “Beneficial owner” requires public-record, reported or verified evidence.</p>
    </ActionForm>
  );
}

export function Unlink({ id }: { id: string }) {
  return <ActionButton run={() => unlinkEntityPerson(id)} confirm="Unlink?" className="h-5 px-1 text-2xs text-ink-400">Unlink</ActionButton>;
}
export function PromoteCareOf({ id }: { id: string }) {
  return <ActionButton variant="secondary" run={() => promoteCareOf(id)}>Create contact from c/o</ActionButton>;
}

type E = Record<string, string | null>;
export function EntityEditForm({ e }: { e: E }) {
  return (
    <ActionForm action={saveEntity} resetOnSuccess={false} successMessage="Saved" className="grid gap-2 sm:grid-cols-3">
      <input type="hidden" name="id" value={e.id!} />
      <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={e.name ?? ""} required /></Field>
      <Field label="Type"><Select name="entity_type" defaultValue={e.entity_type ?? "unknown"}>
        {["individual", "trust", "llc", "limited_partnership", "partnership", "corporation", "nonprofit", "government", "other", "unknown"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
      </Select></Field>
      <Field label="In care of"><Input name="care_of_name" defaultValue={e.care_of_name ?? ""} /></Field>
      <Field label="Phone"><Input name="phone" defaultValue={e.phone ?? ""} /></Field>
      <Field label="SOS file #"><Input name="sos_file_number" defaultValue={e.sos_file_number ?? ""} /></Field>
      <Field label="Mailing address" className="sm:col-span-3"><Input name="mailing_address" defaultValue={e.mailing_address ?? ""} /></Field>
      <Field label="City"><Input name="mailing_city" defaultValue={e.mailing_city ?? ""} /></Field>
      <Field label="State"><Input name="mailing_state" defaultValue={e.mailing_state ?? ""} /></Field>
      <Field label="ZIP"><Input name="mailing_zip" defaultValue={e.mailing_zip ?? ""} /></Field>
      <Field label="Notes" className="sm:col-span-3"><Textarea name="notes" defaultValue={e.notes ?? ""} /></Field>
      <div><Submit>Save owner</Submit></div>
    </ActionForm>
  );
}
