"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertOwned, audit, fail, fd, optDate, optStr, optUuid, refresh, type ActionResult } from "@/lib/action-helpers";
import { propertyWhere, type PropertyFilters } from "@/lib/property-filters";
import { OUTCOMES, type Outcome } from "@/lib/prospecting";

const MAX_ITEMS = 5000;

async function addMatches(orgId: string, listId: string, filters: PropertyFilters, limit: number) {
  const rows = await sql`
    insert into prospect_list_items (org_id, list_id, property_id, entity_id)
    select ${orgId}, ${listId}, property_overview.id, property_overview.owner_entity_id
    from property_overview
    join entity_contactability ec on ec.entity_id = property_overview.owner_entity_id
    where ${propertyWhere(orgId, filters)} and property_overview.owner_entity_id is not null and not ec.owner_suppressed
      and not exists (select 1 from prospect_list_items x where x.list_id = ${listId} and x.property_id = property_overview.id)
    order by property_overview.units desc nulls last
    limit ${limit}
    returning id`;
  return rows.length;
}

export async function createProspectList(_: unknown, form: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const s = await requireSession();
    const d = z.object({ name: z.string().min(2, "Name the list"), description: optStr, filters: z.string().default("{}") }).parse(fd(form));
    const filters = JSON.parse(d.filters) as PropertyFilters;
    delete filters.page; delete filters.sort; delete filters.dir;
    if (!Object.keys(filters).length) throw new Error("Add at least one filter — a list of every property isn't a prospecting list");
    const [l] = await sql`insert into prospect_lists (org_id, name, description, filters, created_by)
                          values (${s.orgId}, ${d.name}, ${d.description}, ${sql.json(filters as never)}, ${s.userId}) returning id`;
    id = l.id;
    const n = await addMatches(s.orgId, id, filters, MAX_ITEMS);
    if (n === 0) { await sql`delete from prospect_lists where id = ${id}`; throw new Error("No contactable properties match those filters"); }
    await audit(s, "prospect_lists", id, "create", { filters, items: n });
  } catch (e) { return fail(e); }
  refresh("/prospecting");
  redirect(`/prospecting/${id}`);
}

export async function refreshProspectList(listId: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "prospect_lists", listId);
    const [l] = await sql`select filters, (select count(*) from prospect_list_items where list_id = ${listId})::int as n from prospect_lists where id = ${listId}`;
    const added = await addMatches(s.orgId, listId, l.filters, Math.max(0, MAX_ITEMS - l.n));
    refresh(`/prospecting/${listId}`);
    return { ok: true, id: String(added) };
  } catch (e) { return fail(e); }
}

export async function archiveProspectList(listId: string, archived: boolean): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "prospect_lists", listId);
    await sql`update prospect_lists set is_archived = ${archived} where id = ${listId}`;
    refresh("/prospecting");
    return { ok: true };
  } catch (e) { return fail(e); }
}

const addDays = (base: string, n: number) => new Date(new Date(base + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const todayLA = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

/**
 * Log one touch for an owner in a list. Updates every property that owner has in the list,
 * writes the activity to the owner + top property (+ person, if chosen), and applies suppression.
 */
export async function logProspectOutcome(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = z.object({
      list_id: z.string().uuid(), entity_id: z.string().uuid(), contact_id: optUuid,
      channel: z.enum(["call", "letter", "email", "text", "in_person"]).default("call"),
      outcome: z.enum(Object.keys(OUTCOMES) as [Outcome, ...Outcome[]]),
      body: optStr, next_action: optStr, next_action_date: optDate,
      dnc_reason: optStr,
    }).parse(fd(form));
    await assertOwned(s, "prospect_lists", d.list_id);
    await assertOwned(s, "entities", d.entity_id);
    await assertOwned(s, "contacts", d.contact_id);
    const rule = OUTCOMES[d.outcome];
    const next = d.next_action_date ?? (rule.days === null ? null : addDays(todayLA(), rule.days));
    const items = await sql`select i.id, i.property_id from prospect_list_items i join properties p on p.id = i.property_id
                            where i.list_id = ${d.list_id} and i.entity_id = ${d.entity_id} order by p.units desc nulls last`;
    if (!items.length) throw new Error("Owner isn't on this list");
    const [list] = await sql`select name from prospect_lists where id = ${d.list_id}`;
    const [ent] = await sql`select phone, mailing_normalized from entities where id = ${d.entity_id}`;

    await sql.begin(async (tx) => {
      await tx`insert into activities (org_id, type, direction, outcome, subject, body, entity_id, property_id, contact_id, created_by)
               values (${s.orgId}, ${d.channel}, 'outbound', ${d.outcome === "do_not_contact" ? "not_interested" : d.outcome},
                       ${"Prospecting: " + list.name}, ${d.body}, ${d.entity_id}, ${items[0].property_id}, ${d.contact_id}, ${s.userId})`;
      await tx`update prospect_list_items set status = ${rule.status}, attempts = attempts + 1, last_attempt_at = now(),
                 next_action_date = ${next}, next_action = ${d.next_action ?? (rule.days === null ? null : "Follow up")}
               where list_id = ${d.list_id} and entity_id = ${d.entity_id}`;
      if (d.outcome === "do_not_contact") {
        await tx`update entities set do_not_contact = true, dnc_reason = ${d.dnc_reason ?? "Asked not to be contacted"}, dnc_at = now() where id = ${d.entity_id}`;
        if (ent.phone) await tx`insert into suppressions (org_id, kind, value, reason, entity_id, created_by)
                                values (${s.orgId}, 'phone', ${ent.phone.replace(/\D/g, "")}, 'do_not_contact', ${d.entity_id}, ${s.userId}) on conflict do nothing`;
        if (ent.mailing_normalized && ent.mailing_normalized !== "|") await tx`insert into suppressions (org_id, kind, value, reason, entity_id, created_by)
                                values (${s.orgId}, 'mailing_address', ${ent.mailing_normalized}, 'do_not_contact', ${d.entity_id}, ${s.userId}) on conflict do nothing`;
        if (d.contact_id) await tx`update contacts set do_not_contact = true, relationship_status = 'do_not_contact' where id = ${d.contact_id}`;
        // pull them out of every other open list too
        await tx`update prospect_list_items set status = 'do_not_contact' where entity_id = ${d.entity_id} and org_id = ${s.orgId}`;
      }
      if (d.outcome === "wrong_number" && ent.phone) {
        await tx`insert into suppressions (org_id, kind, value, reason, entity_id, created_by)
                 values (${s.orgId}, 'phone', ${ent.phone.replace(/\D/g, "")}, 'wrong_number', ${d.entity_id}, ${s.userId}) on conflict do nothing`;
      }
      if (d.contact_id && rule.days !== null) await tx`update contacts set next_follow_up_at = ${next} where id = ${d.contact_id}`;
      if (["open_to_selling", "meeting_set"].includes(d.outcome)) {
        await tx`update properties set listing_status = 'off_market_opportunity' where id = any(${items.map((i) => i.property_id)}) and listing_status = 'none'`;
      }
    });
    refresh(`/prospecting/${d.list_id}`, `/owners/${d.entity_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setOwnerInList(listId: string, entityId: string, patch: { priority?: number; status?: "skipped" | "queued" }): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "prospect_lists", listId);
    if (patch.priority !== undefined) await sql`update prospect_list_items set priority = ${Math.min(3, Math.max(1, patch.priority))} where list_id = ${listId} and entity_id = ${entityId}`;
    if (patch.status) await sql`update prospect_list_items set status = ${patch.status}, next_action_date = null where list_id = ${listId} and entity_id = ${entityId}`;
    refresh(`/prospecting/${listId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setEntityDnc(entityId: string, on: boolean, reason?: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "entities", entityId);
    await sql`update entities set do_not_contact = ${on}, dnc_reason = ${on ? reason ?? "Manual" : null}, dnc_at = ${on ? new Date() : null} where id = ${entityId}`;
    if (on) await sql`update prospect_list_items set status = 'do_not_contact' where entity_id = ${entityId}`;
    else await sql`update prospect_list_items set status = 'queued' where entity_id = ${entityId} and status = 'do_not_contact'`;
    if (!on) await sql`delete from suppressions where entity_id = ${entityId} and reason = 'do_not_contact'`;
    await audit(s, "entities", entityId, on ? "do_not_contact" : "allow_contact", { reason });
    refresh(`/owners/${entityId}`, "/prospecting");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removeSuppression(id: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    await assertOwned(s, "suppressions", id);
    const [r] = await sql`delete from suppressions where id = ${id} returning kind, value, reason`;
    await audit(s, "suppressions", id, "delete", r);
    refresh("/prospecting/suppressions");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function addSuppression(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const s = await requireSession();
    const d = z.object({ kind: z.enum(["phone", "email"]), value: z.string().min(3), reason: z.string().default("opt_out") }).parse(fd(form));
    const value = d.kind === "phone" ? d.value.replace(/\D/g, "").slice(-10) : d.value.toLowerCase().trim();
    if (d.kind === "phone" && value.length !== 10) throw new Error("Phone must have 10 digits");
    await sql`insert into suppressions (org_id, kind, value, reason, created_by) values (${s.orgId}, ${d.kind}, ${value}, ${d.reason}, ${s.userId}) on conflict do nothing`;
    if (d.kind === "phone") await sql`update contact_phones cp set do_not_call = true from contacts c where c.id = cp.contact_id and c.org_id = ${s.orgId} and cp.phone_digits = ${value}`;
    else await sql`update contact_emails ce set opted_out = true from contacts c where c.id = ce.contact_id and c.org_id = ${s.orgId} and lower(ce.email) = ${value}`;
    refresh("/prospecting/suppressions");
    return { ok: true };
  } catch (e) { return fail(e); }
}
