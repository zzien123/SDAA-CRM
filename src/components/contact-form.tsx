"use client";
import { ActionForm, Submit } from "./forms";
import { Card, Field, Input, Select, Textarea } from "./ui";
import { saveContact } from "@/app/(app)/actions";
import { label } from "@/lib/utils";
import { CATEGORIES, STATUSES } from "@/lib/constants";


type C = Record<string, unknown> | null;
const v = (c: C, k: string) => (c?.[k] === null || c?.[k] === undefined ? "" : Array.isArray(c[k]) ? (c[k] as string[]).join(", ") : String(c[k] instanceof Date ? (c[k] as Date).toISOString().slice(0, 10) : c[k]));

export function ContactForm({ c, categories = [], linkPropertyId }: { c: C; categories?: string[]; linkPropertyId?: string }) {
  return (
    <ActionForm action={saveContact} resetOnSuccess={false} className="space-y-4">
      {c?.id ? <input type="hidden" name="id" value={String(c.id)} /> : null}
      {linkPropertyId && <><input type="hidden" name="link_property_id" value={linkPropertyId} /></>}
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <Field label="First name"><Input name="first_name" defaultValue={v(c, "first_name")} autoFocus /></Field>
        <Field label="Last name"><Input name="last_name" defaultValue={v(c, "last_name")} /></Field>
        <Field label="Company"><Input name="company_name" defaultValue={v(c, "company_name")} /></Field>
        <Field label="Title"><Input name="title" defaultValue={v(c, "title")} /></Field>
        {!c && <>
          <Field label="Phone"><Input name="phone" inputMode="tel" /></Field>
          <Field label="Phone type"><Select name="phone_label" defaultValue="mobile"><option>mobile</option><option>office</option><option>home</option><option>other</option></Select></Field>
          <Field label="Email" className="sm:col-span-2"><Input name="email" type="email" /></Field>
        </>}
        {linkPropertyId && (
          <Field label="Role on property">
            <Select name="link_role" defaultValue="property_manager">
              <option value="property_manager">Property manager</option><option value="owner_representative">Owner&apos;s representative</option>
              <option value="decision_maker">Decision maker</option><option value="onsite_manager">On-site manager</option><option value="other">Other</option>
            </Select>
          </Field>
        )}
      </Card>
      <Card className="p-4">
        <span className="field-label">Categories (pick all that apply)</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {CATEGORIES.map((cat) => (
            <label key={cat} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="categories" value={cat} defaultChecked={categories.includes(cat)} />{label(cat)}</label>
          ))}
        </div>
      </Card>
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Relationship status"><Select name="relationship_status" defaultValue={v(c, "relationship_status") || "new"}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Preferred method"><Select name="preferred_method" defaultValue={v(c, "preferred_method")}><option value="">—</option>{["call", "text", "email", "mail", "in_person"].map((m) => <option key={m} value={m}>{label(m)}</option>)}</Select></Field>
        <Field label="Next follow-up"><Input type="date" name="next_follow_up_at" defaultValue={v(c, "next_follow_up_at")} /></Field>
        <Field label="Relationship source"><Input name="relationship_source" defaultValue={v(c, "relationship_source")} placeholder="Referral from…, cold call…" /></Field>
        <Field label="Geographic focus" className="sm:col-span-2" hint="Comma-separated"><Input name="geographic_focus" defaultValue={v(c, "geographic_focus")} placeholder="North Park, Hillcrest" /></Field>
        <Field label="Mailing address" className="sm:col-span-2"><Input name="mailing_address" defaultValue={v(c, "mailing_address")} /></Field>
        <Field label="City"><Input name="mailing_city" defaultValue={v(c, "mailing_city")} /></Field>
        <Field label="State"><Input name="mailing_state" defaultValue={v(c, "mailing_state")} /></Field>
        <Field label="ZIP"><Input name="mailing_zip" defaultValue={v(c, "mailing_zip")} /></Field>
      </Card>
      <Card className="p-4"><Field label="Personal notes (private)"><Textarea name="personal_notes" defaultValue={v(c, "personal_notes")} placeholder="Family, interests, how they like to be approached…" /></Field></Card>
      <Submit>{c ? "Save contact" : "Create contact"}</Submit>
    </ActionForm>
  );
}
