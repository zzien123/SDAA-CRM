"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { classifyEntity, displayCase, formatPhone, normalizeAddress, normalizeName, phoneDigits, zip5 } from "@/lib/normalize";
import { rollbackImport } from "@/lib/importer/engine";

import { assertOwned, audit, fail, fd, optDate, optInt, optNum, optStr, optUuid, refresh, type ActionResult } from "@/lib/action-helpers";
import type { Session } from "@/lib/auth";
export type { ActionResult };

// ---------------------------------------------------------------------------- activities
const ActivitySchema = z.object({
  type: z.enum(["call", "email", "text", "letter", "meeting", "in_person", "note"]),
  direction: z.enum(["outbound", "inbound"]).nullable().optional().transform((v) => v ?? null),
  outcome: optStr, subject: optStr, body: optStr,
  occurred_at: optStr,
  property_id: optUuid, contact_id: optUuid, entity_id: optUuid, opportunity_id: optUuid,
  is_private: z.string().nullable().optional().transform((v) => v === "on"),
  follow_up_date: optDate, follow_up_title: optStr,
});

export async function logActivity(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = ActivitySchema.parse(fd(form));
    if (!d.property_id && !d.contact_id && !d.entity_id && !d.opportunity_id) throw new Error("Activity must be linked to a record");
    if (d.type === "note" && !d.body) throw new Error("Note can't be empty");
    await assertOwned(s, "properties", d.property_id);
    await assertOwned(s, "contacts", d.contact_id);
    await assertOwned(s, "entities", d.entity_id);
    await assertOwned(s, "opportunities", d.opportunity_id);
    const occurred = d.occurred_at ? new Date(d.occurred_at) : new Date();
    const [a] = await sql`insert into activities (org_id, type, direction, outcome, subject, body, occurred_at, property_id, contact_id, entity_id, opportunity_id, is_private, created_by)
      values (${s.orgId}, ${d.type}, ${d.type === "note" ? null : d.direction ?? "outbound"}, ${d.outcome}, ${d.subject}, ${d.body}, ${occurred}, ${d.property_id}, ${d.contact_id}, ${d.entity_id}, ${d.opportunity_id}, ${d.is_private}, ${s.userId})
      returning id`;
    if (d.follow_up_date) {
      const type = d.contact_id || d.entity_id ? "call_owner" : "custom";
      await sql`insert into tasks (org_id, type, title, due_date, property_id, contact_id, entity_id, opportunity_id, created_by, assignee_user_id)
        values (${s.orgId}, ${type}, ${d.follow_up_title ?? "Follow up"}, ${d.follow_up_date}, ${d.property_id}, ${d.contact_id}, ${d.entity_id}, ${d.opportunity_id}, ${s.userId}, ${s.userId})`;
      if (d.contact_id) await sql`update contacts set next_follow_up_at = ${d.follow_up_date} where id = ${d.contact_id}`;
    }
    if (d.contact_id && d.outcome && ["conversation", "meaningful_conversation", "open_to_selling", "meeting_set"].includes(d.outcome)) {
      await sql`update contacts set relationship_status = 'connected' where id = ${d.contact_id} and relationship_status in ('new','attempting','cold')`;
    } else if (d.contact_id && d.type !== "note") {
      await sql`update contacts set relationship_status = 'attempting' where id = ${d.contact_id} and relationship_status = 'new'`;
    }
    refresh(d.property_id ? `/properties/${d.property_id}` : "/", d.contact_id ? `/contacts/${d.contact_id}` : "/", d.entity_id ? `/owners/${d.entity_id}` : "/", d.opportunity_id ? `/opportunities/${d.opportunity_id}` : "/");
    return { ok: true, id: a.id };
  } catch (e) { return fail(e); }
}

export async function deleteActivity(id: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "activities", id);
    const [a] = await sql`delete from activities where id = ${id} and org_id = ${s.orgId} returning row_to_json(activities.*) as row`;
    await audit(s, "activities", id, "delete", a?.row);
    refresh("/properties", "/contacts", "/owners");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- tasks
const TaskSchema = z.object({
  title: z.string().min(1, "Title required"),
  type: z.enum(["call_owner", "follow_up_buyer", "send_financials", "request_rent_roll", "prepare_valuation", "schedule_tour", "submit_offer", "review_documents", "transaction_deadline", "custom"]).default("custom"),
  due_date: optDate, priority: z.coerce.number().int().min(1).max(3).default(2), notes: optStr,
  recurrence_days: optInt,
  property_id: optUuid, contact_id: optUuid, entity_id: optUuid, opportunity_id: optUuid,
});

export async function createTask(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = TaskSchema.parse(fd(form));
    await assertOwned(s, "properties", d.property_id);
    await assertOwned(s, "contacts", d.contact_id);
    await assertOwned(s, "entities", d.entity_id);
    await assertOwned(s, "opportunities", d.opportunity_id);
    const [t] = await sql`insert into tasks ${sql({ ...d, org_id: s.orgId, created_by: s.userId, assignee_user_id: s.userId })} returning id`;
    if (d.contact_id && d.due_date) await sql`update contacts set next_follow_up_at = ${d.due_date} where id = ${d.contact_id} and (next_follow_up_at is null or next_follow_up_at > ${d.due_date})`;
    refresh("/tasks", d.property_id ? `/properties/${d.property_id}` : "/tasks", d.contact_id ? `/contacts/${d.contact_id}` : "/tasks");
    return { ok: true, id: t.id };
  } catch (e) { return fail(e); }
}

export async function setTaskStatus(id: string, status: "open" | "done" | "canceled"): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "tasks", id);
    const [t] = await sql`update tasks set status = ${status}, completed_at = ${status === "done" ? new Date() : null}
                          where id = ${id} and org_id = ${s.orgId} returning *`;
    if (status === "done" && t.recurrence_days) {
      const base = t.due_date ? new Date(t.due_date + "T12:00:00") : new Date();
      const next = new Date(Math.max(base.getTime(), Date.now()) + t.recurrence_days * 86400000).toISOString().slice(0, 10);
      await sql`insert into tasks (org_id, type, title, due_date, priority, notes, recurrence_days, property_id, contact_id, entity_id, opportunity_id, created_by, assignee_user_id)
        values (${s.orgId}, ${t.type}, ${t.title}, ${next}, ${t.priority}, ${t.notes}, ${t.recurrence_days}, ${t.property_id}, ${t.contact_id}, ${t.entity_id}, ${t.opportunity_id}, ${s.userId}, ${t.assignee_user_id})`;
      if (t.contact_id) await sql`update contacts set next_follow_up_at = ${next} where id = ${t.contact_id}`;
    } else if (status === "done" && t.contact_id) {
      await sql`update contacts c set next_follow_up_at = (select min(due_date) from tasks where contact_id = c.id and status = 'open') where id = ${t.contact_id}`;
    }
    refresh("/tasks", t.property_id ? `/properties/${t.property_id}` : "/tasks", t.contact_id ? `/contacts/${t.contact_id}` : "/tasks");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function rescheduleTask(id: string, due: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(due);
    await sql`update tasks set due_date = ${due} where id = ${id} and org_id = ${s.orgId}`;
    refresh("/tasks");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- properties
const PropertySchema = z.object({
  name: optStr, street_address: z.string().min(3, "Address required"), city: optStr, zip: optStr,
  property_type: optStr, units: optInt, building_sf: optInt, lot_sf: optInt, year_built: optInt, year_renovated: optInt,
  floors: optInt, construction_type: optStr, zoning: optStr, parking: optStr,
  land_value: optNum, improvement_value: optNum, estimated_value: optNum, estimated_value_source: optStr,
  last_sale_date: optDate, last_sale_price: optNum, estimated_debt: optNum, estimated_debt_source: optStr,
  listing_status: z.enum(["none", "off_market_opportunity", "active_listing", "in_escrow", "sold", "withdrawn"]).default("none"),
  current_noi: optNum, stabilized_noi: optNum, asking_price: optNum,
  latitude: optNum, longitude: optNum, notes: optStr,
});

export async function saveProperty(_: unknown, form: FormData): Promise<ActionResult> {
  let id: string | null = null;
  try {
    const s = await requireSession();
    const raw = fd(form);
    id = raw.id ?? null;
    const d = PropertySchema.parse(raw);
    const row = { ...d, street_address: displayCase(d.street_address)!, address_normalized: normalizeAddress(d.street_address), city: displayCase(d.city), zip: zip5(d.zip) ?? d.zip };
    if (id) {
      await assertOwned(s, "properties", id);
      const [before] = await sql`select ${sql(Object.keys(row))} from properties where id = ${id}`;
      await sql`update properties set ${sql(row as never)} where id = ${id} and org_id = ${s.orgId}`;
      const changed = Object.fromEntries(Object.entries(row).filter(([k, v]) => String(before[k] ?? "") !== String(v ?? "")).map(([k, v]) => [k, { from: before[k], to: v }]));
      if (Object.keys(changed).length) await audit(s, "properties", id, "update", changed);
    } else {
      const [dup] = await sql`select id from properties where org_id = ${s.orgId} and address_normalized = ${row.address_normalized} and upper(coalesce(city,'')) = upper(${row.city ?? ""})`;
      if (dup) return { ok: false, error: `A property at this address already exists — open it instead: /properties/${dup.id}` };
      const [p] = await sql`insert into properties ${sql({ ...row, org_id: s.orgId, created_by: s.userId, source: "Manual entry" } as never)} returning id`;
      id = p.id;
      const apn = raw.apn;
      if (apn) await sql`insert into parcels (org_id, property_id, apn, apn_raw) values (${s.orgId}, ${id}, ${apn.replace(/\s+/g, "-")}, ${apn}) on conflict do nothing`;
      await audit(s, "properties", id!, "create");
    }
  } catch (e) { return fail(e); }
  refresh(`/properties/${id}`, "/properties");
  redirect(`/properties/${id}`);
}

export async function addParcel(propertyId: string, apn: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "properties", propertyId);
    const clean = apn.trim().replace(/\s+/g, "-");
    if (clean.replace(/\D/g, "").length < 8) throw new Error("APN looks too short");
    const [existing] = await sql`select property_id from parcels where org_id = ${s.orgId} and regexp_replace(apn,'\\D','','g') = ${clean.replace(/\D/g, "")}`;
    if (existing) throw new Error(existing.property_id === propertyId ? "APN already on this property" : "That APN belongs to another property in the CRM");
    await sql`insert into parcels (org_id, property_id, apn, apn_raw) values (${s.orgId}, ${propertyId}, ${clean}, ${apn})`;
    refresh(`/properties/${propertyId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removeParcel(parcelId: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "parcels", parcelId);
    const [p] = await sql`delete from parcels where id = ${parcelId} returning property_id, apn`;
    await audit(s, "parcels", parcelId, "delete", p);
    refresh(`/properties/${p.property_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- ownership
/** Record a new owner of record. The previous ownership row is closed (end_date), never deleted. */
export async function changeOwner(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = z.object({
      property_id: z.string().uuid(), entity_id: optUuid, new_entity_name: optStr,
      start_date: optDate, source: z.string().min(2, "Source required (e.g. grant deed doc #, title report)"),
      confidence: z.enum(["unverified", "public_record", "reported", "verified"]),
      ownership_pct: optNum,
    }).parse(fd(form));
    await assertOwned(s, "properties", d.property_id);
    let entityId = d.entity_id;
    if (!entityId) {
      if (!d.new_entity_name) throw new Error("Pick an existing owner or enter a new owner name");
      const [e] = await sql`insert into entities (org_id, name, name_normalized, entity_type, source)
        values (${s.orgId}, ${d.new_entity_name}, ${normalizeName(d.new_entity_name)}, ${classifyEntity(d.new_entity_name)}, ${d.source}) returning id`;
      entityId = e.id;
    } else await assertOwned(s, "entities", entityId);
    await sql.begin(async (tx) => {
      await tx`update property_ownerships set is_current = false, end_date = coalesce(${d.start_date}::date, current_date)
               where property_id = ${d.property_id} and is_current and vesting_role in ('owner_of_record','second_name_on_title','co_owner')`;
      await tx`insert into property_ownerships (org_id, property_id, entity_id, vesting_role, ownership_pct, start_date, source, confidence, verified_at)
               values (${s.orgId}, ${d.property_id}, ${entityId}, 'owner_of_record', ${d.ownership_pct}, ${d.start_date}, ${d.source}, ${d.confidence},
                       ${d.confidence === "verified" ? new Date().toISOString().slice(0, 10) : null})`;
      if (d.start_date) await tx`update properties set last_sale_date = ${d.start_date} where id = ${d.property_id}`;
    });
    await audit(s, "properties", d.property_id, "owner_change", { entity_id: entityId, source: d.source });
    refresh(`/properties/${d.property_id}`, `/owners/${entityId}`);
    return { ok: true, id: entityId! };
  } catch (e) { return fail(e); }
}

export async function addCoOwner(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = z.object({ property_id: z.string().uuid(), entity_id: z.string().uuid(), vesting_role: z.enum(["co_owner", "second_name_on_title"]), ownership_pct: optNum, source: z.string().min(2), confidence: z.enum(["unverified", "public_record", "reported", "verified"]) }).parse(fd(form));
    await assertOwned(s, "properties", d.property_id);
    await assertOwned(s, "entities", d.entity_id);
    await sql`insert into property_ownerships (org_id, property_id, entity_id, vesting_role, ownership_pct, source, confidence) values (${s.orgId}, ${d.property_id}, ${d.entity_id}, ${d.vesting_role}, ${d.ownership_pct}, ${d.source}, ${d.confidence})`;
    refresh(`/properties/${d.property_id}`, `/owners/${d.entity_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function resolveOwnershipReview(id: string, decision: "accepted" | "rejected"): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "ownership_reviews", id);
    const [r] = await sql`select * from ownership_reviews where id = ${id} and status = 'pending'`;
    if (!r) throw new Error("Already resolved");
    await sql.begin(async (tx) => {
      if (decision === "accepted") {
        await tx`update property_ownerships set is_current = false, end_date = coalesce(${r.proposed_sale_date}::date, current_date)
                 where property_id = ${r.property_id} and is_current and vesting_role in ('owner_of_record','second_name_on_title','co_owner')`;
        await tx`insert into property_ownerships (org_id, property_id, entity_id, vesting_role, start_date, source, confidence)
                 values (${s.orgId}, ${r.property_id}, ${r.proposed_entity_id}, 'owner_of_record', ${r.proposed_sale_date}, ${r.source}, 'public_record')`;
        if (r.proposed_sale_date) await tx`update properties set last_sale_date = ${r.proposed_sale_date} where id = ${r.property_id}`;
      }
      await tx`update ownership_reviews set status = ${decision}, resolved_by = ${s.userId}, resolved_at = now() where id = ${id}`;
    });
    await audit(s, "ownership_reviews", id, decision);
    refresh("/data", `/properties/${r.property_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- entities
const EntitySchema = z.object({
  name: z.string().min(2), entity_type: z.enum(["individual", "trust", "llc", "limited_partnership", "partnership", "corporation", "nonprofit", "government", "other", "unknown"]),
  care_of_name: optStr, mailing_address: optStr, mailing_city: optStr, mailing_state: optStr, mailing_zip: optStr,
  phone: optStr, sos_file_number: optStr, notes: optStr,
});
export async function saveEntity(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const raw = fd(form);
    const d = EntitySchema.parse(raw);
    const row = { ...d, name_normalized: normalizeName(d.name), phone: d.phone ? formatPhone(d.phone) ?? d.phone : null, mailing_zip: zip5(d.mailing_zip) ?? d.mailing_zip,
      mailing_normalized: [normalizeAddress(d.mailing_address), zip5(d.mailing_zip) ?? ""].join("|") };
    if (raw.id) {
      await assertOwned(s, "entities", raw.id);
      const [before] = await sql`select phone from entities where id = ${raw.id}`;
      const phoneChanged = before.phone !== row.phone;
      await sql`update entities set ${sql({ ...row, ...(phoneChanged ? { phone_source: "Manual entry" } : {}) } as never)} where id = ${raw.id}`;
      await audit(s, "entities", raw.id, "update", d);
      refresh(`/owners/${raw.id}`);
      return { ok: true, id: raw.id };
    }
    const [e] = await sql`insert into entities ${sql({ ...row, org_id: s.orgId, source: "Manual entry" } as never)} returning id`;
    refresh("/owners");
    return { ok: true, id: e.id };
  } catch (e) { return fail(e); }
}

/** Link a person to an ownership entity (trustee, managing member, beneficial owner...) with evidence. */
export async function linkPersonToEntity(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = z.object({
      entity_id: z.string().uuid(), contact_id: optUuid, first_name: optStr, last_name: optStr,
      role: z.enum(["beneficial_owner", "managing_member", "member", "general_partner", "limited_partner", "trustee", "beneficiary", "officer", "authorized_representative", "registered_agent", "in_care_of", "other"]),
      ownership_pct: optNum, is_decision_maker: z.enum(["yes", "no", "unknown"]).default("unknown"),
      source: z.string().min(2, "Source required (e.g. SOS Statement of Information 2025, owner told me)"),
      confidence: z.enum(["unverified", "public_record", "reported", "verified"]), notes: optStr,
    }).parse(fd(form));
    await assertOwned(s, "entities", d.entity_id);
    if (d.role === "beneficial_owner" && d.confidence === "unverified") throw new Error("Beneficial ownership needs evidence: set confidence to public record, reported or verified — or use a different role");
    let contactId = d.contact_id;
    if (!contactId) {
      if (!d.first_name && !d.last_name) throw new Error("Pick a contact or enter a name");
      const [c] = await sql`insert into contacts (org_id, first_name, last_name, relationship_source, owner_user_id) values (${s.orgId}, ${d.first_name}, ${d.last_name}, ${d.source}, ${s.userId}) returning id`;
      contactId = c.id;
      await sql`insert into contact_categories (contact_id, category) values (${contactId}, 'property_owner') on conflict do nothing`;
    } else await assertOwned(s, "contacts", contactId);
    await sql`insert into entity_people (org_id, entity_id, contact_id, role, ownership_pct, is_decision_maker, source, confidence, verified_at, notes)
      values (${s.orgId}, ${d.entity_id}, ${contactId}, ${d.role}, ${d.ownership_pct}, ${d.is_decision_maker === "unknown" ? null : d.is_decision_maker === "yes"},
              ${d.source}, ${d.confidence}, ${d.confidence === "verified" ? new Date().toISOString().slice(0, 10) : null}, ${d.notes})
      on conflict (entity_id, contact_id, role) do update set source = excluded.source, confidence = excluded.confidence, ownership_pct = excluded.ownership_pct,
         is_decision_maker = excluded.is_decision_maker, notes = excluded.notes, verified_at = excluded.verified_at`;
    if (["beneficial_owner", "managing_member", "member", "general_partner", "trustee"].includes(d.role))
      await sql`insert into contact_categories (contact_id, category) values (${contactId}, 'property_owner') on conflict do nothing`;
    await audit(s, "entity_people", d.entity_id, "link", { contact_id: contactId, role: d.role, confidence: d.confidence });
    refresh(`/owners/${d.entity_id}`, `/contacts/${contactId}`);
    return { ok: true, id: contactId! };
  } catch (e) { return fail(e); }
}

export async function unlinkEntityPerson(id: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "entity_people", id);
    const [r] = await sql`delete from entity_people where id = ${id} returning entity_id, contact_id, role`;
    await audit(s, "entity_people", id, "unlink", r);
    refresh(`/owners/${r.entity_id}`, `/contacts/${r.contact_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Turn the tax roll's "in care of" name into a contact, linked with role in_care_of (unverified). */
export async function promoteCareOf(entityId: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "entities", entityId);
    const [e] = await sql`select care_of_name, mailing_address, mailing_city, mailing_state, mailing_zip, phone, source from entities where id = ${entityId}`;
    if (!e.care_of_name) throw new Error("No in-care-of name on this owner");
    const parts = e.care_of_name.replace(/-(ptr|tr|mgr)$/i, "").trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : null;
    const first = parts.join(" ");
    const [c] = await sql`insert into contacts (org_id, first_name, last_name, mailing_address, mailing_city, mailing_state, mailing_zip, relationship_source, owner_user_id)
      values (${s.orgId}, ${first}, ${last}, ${e.mailing_address}, ${e.mailing_city}, ${e.mailing_state}, ${e.mailing_zip}, ${"In-care-of on " + (e.source ?? "tax roll")}, ${s.userId}) returning id`;
    if (e.phone) await sql`insert into contact_phones (contact_id, phone, phone_digits, label, source) values (${c.id}, ${e.phone}, ${phoneDigits(e.phone)}, 'other', ${"Owner phone on " + (e.source ?? "tax roll") + " (unverified)"})`;
    await sql`insert into entity_people (org_id, entity_id, contact_id, role, source, confidence) values (${s.orgId}, ${entityId}, ${c.id}, 'in_care_of', ${e.source ?? "tax roll"}, 'public_record')`;
    refresh(`/owners/${entityId}`);
    return { ok: true, id: c.id };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- contacts
const CATEGORIES = ["property_owner", "investor_buyer", "seller", "broker", "property_manager", "attorney", "lender", "escrow_officer", "title_rep", "contractor", "other_professional"] as const;
const ContactSchema = z.object({
  first_name: optStr, last_name: optStr, title: optStr, company_name: optStr,
  mailing_address: optStr, mailing_city: optStr, mailing_state: optStr, mailing_zip: optStr,
  preferred_method: z.enum(["call", "text", "email", "mail", "in_person"]).nullable().optional().transform((v) => v ?? null),
  relationship_status: z.enum(["new", "attempting", "connected", "relationship", "client", "cold", "do_not_contact"]).default("new"),
  geographic_focus: optStr, next_follow_up_at: optDate, personal_notes: optStr, relationship_source: optStr,
  phone: optStr, phone_label: optStr, email: optStr,
});

async function companyId(s: Session, name: string | null) {
  if (!name) return null;
  const [c] = await sql`select id from companies where org_id = ${s.orgId} and lower(name) = lower(${name})`;
  if (c) return c.id as string;
  const [n] = await sql`insert into companies (org_id, name) values (${s.orgId}, ${name}) returning id`;
  return n.id as string;
}

export async function saveContact(_: unknown, form: FormData): Promise<ActionResult> {
  let id: string | null = null;
  try {
    const s = await requireSession();
    const raw = fd(form);
    id = raw.id ?? null;
    const d = ContactSchema.parse(raw);
    if (!d.first_name && !d.last_name) throw new Error("Name required");
    const cats = form.getAll("categories").map(String).filter((c): c is (typeof CATEGORIES)[number] => (CATEGORIES as readonly string[]).includes(c));
    const row = {
      first_name: d.first_name, last_name: d.last_name, title: d.title, company_id: await companyId(s, d.company_name),
      mailing_address: d.mailing_address, mailing_city: d.mailing_city, mailing_state: d.mailing_state, mailing_zip: d.mailing_zip,
      preferred_method: d.preferred_method, relationship_status: d.relationship_status,
      geographic_focus: d.geographic_focus ? d.geographic_focus.split(",").map((x) => x.trim()).filter(Boolean) : [],
      next_follow_up_at: d.next_follow_up_at, personal_notes: d.personal_notes, relationship_source: d.relationship_source,
      do_not_contact: d.relationship_status === "do_not_contact",
    };
    if (id) {
      await assertOwned(s, "contacts", id);
      await sql`update contacts set ${sql(row as never)} where id = ${id}`;
      await audit(s, "contacts", id, "update", row);
    } else {
      if (d.email) {
        const [dup] = await sql`select c.id from contacts c join contact_emails e on e.contact_id = c.id where c.org_id = ${s.orgId} and lower(e.email) = lower(${d.email})`;
        if (dup) return { ok: false, error: `A contact with ${d.email} already exists — /contacts/${dup.id}` };
      }
      const [c] = await sql`insert into contacts ${sql({ ...row, org_id: s.orgId, owner_user_id: s.userId } as never)} returning id`;
      id = c.id;
      if (d.phone) await sql`insert into contact_phones (contact_id, phone, phone_digits, label, is_primary, source) values (${id}, ${formatPhone(d.phone) ?? d.phone}, ${phoneDigits(d.phone) ?? d.phone.replace(/\D/g, "")}, ${d.phone_label ?? "mobile"}, true, 'Manual entry')`;
      if (d.email) await sql`insert into contact_emails (contact_id, email, is_primary, source) values (${id}, ${d.email.toLowerCase()}, true, 'Manual entry')`;
      // optional links when created from a property / entity page
      if (raw.link_property_id && raw.link_role) {
        await assertOwned(s, "properties", raw.link_property_id);
        await sql`insert into property_contacts (org_id, property_id, contact_id, role, source) values (${s.orgId}, ${raw.link_property_id}, ${id}, ${raw.link_role}, 'Manual entry')`;
      }
    }
    await sql`delete from contact_categories where contact_id = ${id}`;
    if (cats.length) await sql`insert into contact_categories ${sql(cats.map((c) => ({ contact_id: id, category: c })))}`;
  } catch (e) { return fail(e); }
  refresh(`/contacts/${id}`, "/contacts", "/buyers");
  redirect(`/contacts/${id}`);
}

export async function addContactMethod(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = z.object({ contact_id: z.string().uuid(), kind: z.enum(["phone", "email"]), value: z.string().min(3), label: optStr, source: optStr }).parse(fd(form));
    await assertOwned(s, "contacts", d.contact_id);
    if (d.kind === "phone") {
      const digits = phoneDigits(d.value);
      if (!digits) throw new Error("Phone must have 10 digits");
      await sql`insert into contact_phones (contact_id, phone, phone_digits, label, source) values (${d.contact_id}, ${formatPhone(d.value)}, ${digits}, ${d.label ?? "mobile"}, ${d.source ?? "Manual entry"})`;
    } else {
      if (!/^\S+@\S+\.\S+$/.test(d.value)) throw new Error("Invalid email");
      await sql`insert into contact_emails (contact_id, email, label, source) values (${d.contact_id}, ${d.value.toLowerCase()}, ${d.label ?? "work"}, ${d.source ?? "Manual entry"})`;
    }
    refresh(`/contacts/${d.contact_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function toggleContactMethodFlag(kind: "phone" | "email", id: string, contactId: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "contacts", contactId);
    if (kind === "phone") await sql`update contact_phones set do_not_call = not do_not_call where id = ${id} and contact_id = ${contactId}`;
    else await sql`update contact_emails set opted_out = not opted_out where id = ${id} and contact_id = ${contactId}`;
    refresh(`/contacts/${contactId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function linkContactToProperty(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = z.object({ property_id: z.string().uuid(), contact_id: z.string().uuid(), role: z.string().min(2), notes: optStr }).parse(fd(form));
    await assertOwned(s, "properties", d.property_id);
    await assertOwned(s, "contacts", d.contact_id);
    await sql`insert into property_contacts (org_id, property_id, contact_id, role, notes, source) values (${s.orgId}, ${d.property_id}, ${d.contact_id}, ${d.role}, ${d.notes}, 'Manual entry')`;
    refresh(`/properties/${d.property_id}`, `/contacts/${d.contact_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function unlinkPropertyContact(id: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "property_contacts", id);
    const [r] = await sql`delete from property_contacts where id = ${id} returning property_id, contact_id`;
    refresh(`/properties/${r.property_id}`, `/contacts/${r.contact_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- buyers
const CriteriaSchema = z.object({
  contact_id: z.string().uuid(), label: z.string().min(1), is_active: z.string().nullable().optional().transform((v) => v === "on"),
  target_markets: optStr, property_types: optStr, min_units: optInt, max_units: optInt, min_price: optNum, max_price: optNum,
  available_equity: optNum, financing_preference: optStr, target_cap_rate: optNum, target_coc: optNum, target_irr: optNum,
  strategy: z.enum(["value_add", "stabilized", "development", "owner_user", "any"]).nullable().optional().transform((v) => v ?? null),
  seller_financing_interest: z.enum(["yes", "no", "unknown"]).default("unknown"),
  is_1031: z.enum(["yes", "no", "unknown"]).default("unknown"),
  exchange_relinquished_close: optDate, exchange_id_deadline: optDate, exchange_close_deadline: optDate,
  timeline: optStr, notes: optStr, last_confirmed_at: optDate,
});
const tri = (v: "yes" | "no" | "unknown") => (v === "unknown" ? null : v === "yes");
const pct = (v: number | null) => (v === null ? null : v > 1 ? v / 100 : v); // accepts 5.5 or 0.055

export async function saveBuyerCriteria(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const raw = fd(form);
    const d = CriteriaSchema.parse(raw);
    await assertOwned(s, "contacts", d.contact_id);
    const list = (v: string | null) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
    let idDeadline = d.exchange_id_deadline, closeDeadline = d.exchange_close_deadline;
    if (d.exchange_relinquished_close) { // IRC §1031: 45 days to identify, 180 days to close (calendar days; confirm with QI / tax-return-due-date exception)
      const base = new Date(d.exchange_relinquished_close + "T12:00:00Z").getTime();
      idDeadline ??= new Date(base + 45 * 86400000).toISOString().slice(0, 10);
      closeDeadline ??= new Date(base + 180 * 86400000).toISOString().slice(0, 10);
    }
    const row = {
      ...d, target_markets: list(d.target_markets), property_types: list(d.property_types),
      seller_financing_interest: tri(d.seller_financing_interest), is_1031: tri(d.is_1031),
      target_cap_rate: pct(d.target_cap_rate), target_coc: pct(d.target_coc), target_irr: pct(d.target_irr),
      exchange_id_deadline: idDeadline, exchange_close_deadline: closeDeadline,
    };
    if (raw.id) {
      await assertOwned(s, "buyer_criteria", raw.id);
      await sql`update buyer_criteria set ${sql(row as never)} where id = ${raw.id}`;
    } else {
      await sql`insert into buyer_criteria ${sql({ ...row, org_id: s.orgId } as never)}`;
      await sql`insert into contact_categories (contact_id, category) values (${d.contact_id}, 'investor_buyer') on conflict do nothing`;
    }
    refresh(`/contacts/${d.contact_id}`, "/buyers");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteBuyerCriteria(id: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "buyer_criteria", id);
    const [r] = await sql`delete from buyer_criteria where id = ${id} returning contact_id`;
    refresh(`/contacts/${r.contact_id}`, "/buyers");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- opportunities
const OppSchema = z.object({
  name: z.string().min(2), property_id: optUuid, stage_id: z.string().uuid(),
  side: z.enum(["seller", "buyer", "dual"]).default("seller"),
  seller_contact_id: optUuid, seller_entity_id: optUuid, buyer_contact_id: optUuid,
  asking_price: optNum, expected_price: optNum, probability: optNum, expected_close_date: optDate,
  commission_rate: optNum, brokerage_split: optNum, deal_source: optStr, next_action: optStr, next_action_date: optDate,
  notes: optStr, lost_reason: optStr,
});

export async function saveOpportunity(_: unknown, form: FormData): Promise<ActionResult> {
  let id: string | null = null;
  try {
    const s = await requireSession();
    const raw = fd(form);
    id = raw.id ?? null;
    const d = OppSchema.parse(raw);
    await assertOwned(s, "pipeline_stages", d.stage_id);
    await assertOwned(s, "properties", d.property_id);
    await assertOwned(s, "contacts", d.seller_contact_id);
    await assertOwned(s, "contacts", d.buyer_contact_id);
    await assertOwned(s, "entities", d.seller_entity_id);
    const row = { ...d, commission_rate: pct(d.commission_rate), brokerage_split: pct(d.brokerage_split) };
    const [stage] = await sql`select kind from pipeline_stages where id = ${d.stage_id}`;
    if (id) {
      await assertOwned(s, "opportunities", id);
      const [before] = await sql`select stage_id from opportunities where id = ${id}`;
      const stageChanged = before.stage_id !== d.stage_id;
      await sql`update opportunities set ${sql({ ...row, ...(stageChanged ? { stage_changed_at: new Date(), closed_at: ["won", "lost"].includes(stage.kind) ? new Date() : null } : {}) } as never)} where id = ${id}`;
      if (stageChanged) {
        const [st] = await sql`select name from pipeline_stages where id = ${d.stage_id}`;
        await sql`insert into activities (org_id, type, subject, opportunity_id, property_id, created_by) values (${s.orgId}, 'status_change', ${"Stage → " + st.name}, ${id}, ${d.property_id}, ${s.userId})`;
      }
    } else {
      const [o] = await sql`insert into opportunities ${sql({ ...row, org_id: s.orgId, owner_user_id: s.userId } as never)} returning id`;
      id = o.id;
      // opened from a prospecting queue: mark that owner converted in the list
      if (raw.prospect_list_id && d.seller_entity_id) {
        await sql`update prospect_list_items set status = 'converted', opportunity_id = ${id}
                  where list_id = ${raw.prospect_list_id} and entity_id = ${d.seller_entity_id} and org_id = ${s.orgId}`;
      }
      if (d.property_id && stage.kind === "open") await sql`update properties set listing_status = 'off_market_opportunity' where id = ${d.property_id} and listing_status = 'none'`;
    }
    if (d.property_id && stage.kind === "under_contract") await sql`update properties set listing_status = 'in_escrow' where id = ${d.property_id}`;
    if (d.property_id && stage.kind === "won") await sql`update properties set listing_status = 'sold' where id = ${d.property_id}`;
  } catch (e) { return fail(e); }
  refresh(`/opportunities/${id}`, "/opportunities");
  redirect(`/opportunities/${id}`);
}

export async function moveOpportunity(id: string, stageId: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "opportunities", id);
    await assertOwned(s, "pipeline_stages", stageId);
    const [st] = await sql`select name, kind from pipeline_stages where id = ${stageId}`;
    const [o] = await sql`update opportunities set stage_id = ${stageId}, stage_changed_at = now(), closed_at = ${["won", "lost"].includes(st.kind) ? new Date() : null}
                          where id = ${id} returning property_id`;
    await sql`insert into activities (org_id, type, subject, opportunity_id, property_id, created_by) values (${s.orgId}, 'status_change', ${"Stage → " + st.name}, ${id}, ${o.property_id}, ${s.userId})`;
    if (o.property_id && st.kind === "under_contract") await sql`update properties set listing_status = 'in_escrow' where id = ${o.property_id}`;
    if (o.property_id && st.kind === "won") await sql`update properties set listing_status = 'sold' where id = ${o.property_id}`;
    refresh("/opportunities", `/opportunities/${id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- settings & imports
export async function saveSettings(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    if (s.role !== "admin") throw new Error("Only an admin can change settings");
    const d = z.object({ default_commission_rate: optNum, default_brokerage_split: optNum }).parse(fd(form));
    await sql`update organizations set settings = settings || ${sql.json({ default_commission_rate: pct(d.default_commission_rate), default_brokerage_split: pct(d.default_brokerage_split) })} where id = ${s.orgId}`;
    refresh("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveStage(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    if (s.role !== "admin") throw new Error("Only an admin can change stages");
    const raw = fd(form);
    const d = z.object({ name: z.string().min(2), default_probability: optNum, kind: z.enum(["open", "under_contract", "won", "lost"]).default("open") }).parse(raw);
    if (raw.id) {
      await assertOwned(s, "pipeline_stages", raw.id);
      await sql`update pipeline_stages set name = ${d.name}, default_probability = ${d.default_probability ?? 0} where id = ${raw.id}`;
    } else {
      // custom stages are inserted before Closed / Lost
      await sql.begin(async (tx) => {
        const [{ pos }] = await tx`select coalesce(min(position), 1) as pos from pipeline_stages where org_id = ${s.orgId} and kind in ('won','lost')`;
        await tx`update pipeline_stages set position = position + 1 where org_id = ${s.orgId} and position >= ${pos}`;
        await tx`insert into pipeline_stages (org_id, name, position, default_probability, kind) values (${s.orgId}, ${d.name}, ${pos}, ${d.default_probability ?? 0}, ${d.kind})`;
      });
    }
    refresh("/settings", "/opportunities");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function rollbackImportAction(importId: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "imports", importId);
    const r = await rollbackImport(sql, s.orgId, importId);
    if (!r.ok) return { ok: false, error: r.reason };
    await audit(s, "imports", importId, "rollback");
    refresh("/data", "/properties", "/owners");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------- buyer outreach from matches
export async function createBuyerOutreach(propertyId: string, opportunityId: string | null, contactIds: string[]): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "properties", propertyId);
    await assertOwned(s, "opportunities", opportunityId);
    if (!contactIds.length || contactIds.length > 100) throw new Error("Pick 1–100 buyers");
    const ok = await sql`select id, full_name from contacts where org_id = ${s.orgId} and id = any(${contactIds}) and not do_not_contact`;
    const [p] = await sql`select street_address from properties where id = ${propertyId}`;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    if (ok.length) await sql`insert into tasks ${sql(ok.map((c) => ({
      org_id: s.orgId, type: "follow_up_buyer", title: `Send ${p.street_address} to ${c.full_name}`, due_date: today, priority: 1,
      contact_id: c.id, property_id: propertyId, opportunity_id: opportunityId, created_by: s.userId, assignee_user_id: s.userId,
    })))}`;
    refresh(`/properties/${propertyId}`, opportunityId ? `/opportunities/${opportunityId}` : "/tasks", "/tasks");
    return { ok: true, id: String(ok.length) };
  } catch (e) { return fail(e); }
}
