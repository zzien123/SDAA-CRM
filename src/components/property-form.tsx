"use client";
import { ActionForm, Submit } from "./forms";
import { Card, Field, Input, Select, Textarea } from "./ui";
import { saveProperty } from "@/app/(app)/actions";

type P = Record<string, unknown> | null;
const v = (p: P, k: string) => (p?.[k] === null || p?.[k] === undefined ? "" : String(p[k] instanceof Date ? (p[k] as Date).toISOString().slice(0, 10) : p[k]));

function F({ p, k, label, ...rest }: { p: P; k: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label}><Input name={k} defaultValue={v(p, k)} {...rest} /></Field>;
}

export function PropertyForm({ p }: { p: P }) {
  return (
    <ActionForm action={saveProperty} resetOnSuccess={false} className="space-y-4">
      {p?.id ? <input type="hidden" name="id" value={String(p.id)} /> : null}
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <F p={p} k="street_address" label="Street address *" required className="sm:col-span-2" />
        <F p={p} k="city" label="City" />
        <F p={p} k="zip" label="ZIP" />
        <F p={p} k="name" label="Property name" />
        {!p && <Field label="APN"><Input name="apn" /></Field>}
        <Field label="Property type">
          <Select name="property_type" defaultValue={v(p, "property_type")}>
            <option value="">—</option><option value="multifamily_5plus">Multifamily 5+</option><option value="multifamily_2_4">Multifamily 2–4</option>
            <option value="mixed_use">Mixed use</option><option value="commercial">Commercial</option><option value="land">Land / development</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select name="listing_status" defaultValue={v(p, "listing_status") || "none"}>
            <option value="none">Not in play</option><option value="off_market_opportunity">Off-market opportunity</option><option value="active_listing">Active listing</option>
            <option value="in_escrow">In escrow</option><option value="sold">Sold</option><option value="withdrawn">Withdrawn</option>
          </Select>
        </Field>
      </Card>
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <F p={p} k="units" label="Units" inputMode="numeric" />
        <F p={p} k="building_sf" label="Building SF" inputMode="numeric" />
        <F p={p} k="lot_sf" label="Lot SF" inputMode="numeric" />
        <F p={p} k="year_built" label="Year built" inputMode="numeric" />
        <F p={p} k="year_renovated" label="Year renovated" inputMode="numeric" />
        <F p={p} k="floors" label="Stories" inputMode="numeric" />
        <F p={p} k="construction_type" label="Construction" />
        <F p={p} k="zoning" label="Zoning" />
        <F p={p} k="parking" label="Parking" />
        <F p={p} k="latitude" label="Latitude" inputMode="decimal" />
        <F p={p} k="longitude" label="Longitude" inputMode="decimal" />
      </Card>
      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <F p={p} k="land_value" label="Assessed land $" inputMode="decimal" />
        <F p={p} k="improvement_value" label="Assessed improvements $" inputMode="decimal" />
        <F p={p} k="last_sale_date" label="Last sale date" type="date" />
        <F p={p} k="last_sale_price" label="Last sale price $" inputMode="decimal" />
        <F p={p} k="estimated_value" label="Est. market value $" inputMode="decimal" />
        <F p={p} k="estimated_value_source" label="Value source" placeholder="e.g. my BOV 10/2026" />
        <F p={p} k="estimated_debt" label="Est. debt $" inputMode="decimal" />
        <F p={p} k="estimated_debt_source" label="Debt source" placeholder="e.g. DOT recorded 2019, $2.1M" />
        <F p={p} k="asking_price" label="Asking price $" inputMode="decimal" />
        <F p={p} k="current_noi" label="Current NOI $" inputMode="decimal" />
        <F p={p} k="stabilized_noi" label="Stabilized NOI $" inputMode="decimal" />
      </Card>
      <Card className="p-4"><Field label="Internal notes"><Textarea name="notes" defaultValue={v(p, "notes")} rows={4} /></Field></Card>
      <Submit>{p ? "Save changes" : "Create property"}</Submit>
    </ActionForm>
  );
}
