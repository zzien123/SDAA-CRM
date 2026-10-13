"use client";
import { ActionButton, ActionForm, Submit } from "./forms";
import { Field, Input, Select, Textarea } from "./ui";
import { saveBuyerCriteria, deleteBuyerCriteria } from "@/app/(app)/actions";

type C = Record<string, unknown> | null;
const v = (c: C, k: string) => {
  const x = c?.[k];
  if (x === null || x === undefined) return "";
  if (Array.isArray(x)) return x.join(", ");
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (["target_cap_rate", "target_coc", "target_irr"].includes(k)) return String(+(Number(x) * 100).toFixed(2));
  return String(x);
};
const tri = (x: unknown) => (x === true ? "yes" : x === false ? "no" : "unknown");

export function CriteriaForm({ contactId, c, onDone }: { contactId: string; c?: C; onDone?: () => void }) {
  return (
    <ActionForm action={saveBuyerCriteria} resetOnSuccess={!c} onDone={onDone} successMessage={c ? "Saved" : undefined} className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="contact_id" value={contactId} />
      {c?.id ? <input type="hidden" name="id" value={String(c.id)} /> : null}
      <Field label="Profile name *" className="sm:col-span-2"><Input name="label" required defaultValue={v(c ?? null, "label")} placeholder="e.g. 10–30 unit value-add, coastal" /></Field>
      <Field label="Strategy"><Select name="strategy" defaultValue={v(c ?? null, "strategy")}><option value="">Unknown</option><option value="value_add">Value-add</option><option value="stabilized">Stabilized</option><option value="development">Development</option><option value="owner_user">Owner-user</option><option value="any">Any</option></Select></Field>
      <label className="flex items-end gap-1.5 pb-2 text-[13px]"><input type="checkbox" name="is_active" defaultChecked={c ? c.is_active !== false : true} /> Active</label>
      <Field label="Target markets" className="sm:col-span-2" hint="Cities, neighborhoods or ZIPs, comma-separated"><Input name="target_markets" defaultValue={v(c ?? null, "target_markets")} placeholder="North Park, Hillcrest, 92104" /></Field>
      <Field label="Property types" className="sm:col-span-2" hint="Comma-separated"><Input name="property_types" defaultValue={v(c ?? null, "property_types")} placeholder="multifamily_5plus, mixed_use" /></Field>
      <Field label="Min units"><Input name="min_units" defaultValue={v(c ?? null, "min_units")} inputMode="numeric" /></Field>
      <Field label="Max units"><Input name="max_units" defaultValue={v(c ?? null, "max_units")} inputMode="numeric" /></Field>
      <Field label="Min price $"><Input name="min_price" defaultValue={v(c ?? null, "min_price")} inputMode="decimal" /></Field>
      <Field label="Max price $"><Input name="max_price" defaultValue={v(c ?? null, "max_price")} inputMode="decimal" /></Field>
      <Field label="Available equity $"><Input name="available_equity" defaultValue={v(c ?? null, "available_equity")} inputMode="decimal" /></Field>
      <Field label="Financing"><Select name="financing_preference" defaultValue={v(c ?? null, "financing_preference")}><option value="">Unknown</option><option value="all_cash">All cash</option><option value="agency">Agency</option><option value="bank">Bank / portfolio</option><option value="seller_financing">Seller financing</option><option value="assumable">Assumable</option><option value="any">Any</option></Select></Field>
      <Field label="Seller financing interest"><Select name="seller_financing_interest" defaultValue={tri(c?.seller_financing_interest)}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
      <Field label="Timeline"><Input name="timeline" defaultValue={v(c ?? null, "timeline")} placeholder="Next 6 months" /></Field>
      <Field label="Target cap %"><Input name="target_cap_rate" defaultValue={v(c ?? null, "target_cap_rate")} inputMode="decimal" placeholder="5.25" /></Field>
      <Field label="Target CoC %"><Input name="target_coc" defaultValue={v(c ?? null, "target_coc")} inputMode="decimal" /></Field>
      <Field label="Target IRR %"><Input name="target_irr" defaultValue={v(c ?? null, "target_irr")} inputMode="decimal" /></Field>
      <Field label="1031 exchange"><Select name="is_1031" defaultValue={tri(c?.is_1031)}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
      <Field label="Relinquished close" hint="Fills 45/180-day dates if blank"><Input type="date" name="exchange_relinquished_close" defaultValue={v(c ?? null, "exchange_relinquished_close")} /></Field>
      <Field label="ID deadline (45-day)"><Input type="date" name="exchange_id_deadline" defaultValue={v(c ?? null, "exchange_id_deadline")} /></Field>
      <Field label="Close deadline (180-day)"><Input type="date" name="exchange_close_deadline" defaultValue={v(c ?? null, "exchange_close_deadline")} /></Field>
      <Field label="Criteria last confirmed"><Input type="date" name="last_confirmed_at" defaultValue={v(c ?? null, "last_confirmed_at")} /></Field>
      <Field label="Notes" className="sm:col-span-4"><Textarea name="notes" defaultValue={v(c ?? null, "notes")} rows={2} /></Field>
      <div className="flex items-center gap-2 sm:col-span-4">
        <Submit>{c ? "Save profile" : "Add criteria profile"}</Submit>
        {c?.id ? <ActionButton run={() => deleteBuyerCriteria(String(c.id))} confirm="Delete profile?" variant="danger">Delete</ActionButton> : null}
      </div>
      <p className="text-2xs text-ink-500 sm:col-span-4">Blank = unknown. Unknown preferences are never treated as a match. Confirm 1031 deadlines with the buyer’s QI.</p>
    </ActionForm>
  );
}
