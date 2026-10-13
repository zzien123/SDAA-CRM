import "server-only";
import { sql } from "./db";

export type TimelineScope = { propertyId?: string; contactId?: string; entityId?: string; opportunityId?: string };

/** Unified relationship timeline: direct activity + activity on linked owners / people / properties. */
export async function timeline(orgId: string, scope: TimelineScope, limit = 50) {
  const { propertyId, contactId, entityId, opportunityId } = scope;
  return sql`
    select a.*, p.street_address, c.full_name as contact_name, e.name as entity_name, o.name as opp_name, u.full_name as author
    from activities a
    left join properties p on p.id = a.property_id
    left join contacts c on c.id = a.contact_id
    left join entities e on e.id = a.entity_id
    left join opportunities o on o.id = a.opportunity_id
    left join users u on u.id = a.created_by
    where a.org_id = ${orgId} and (
      ${propertyId ? sql`a.property_id = ${propertyId}
        or a.entity_id in (select entity_id from property_ownerships where property_id = ${propertyId} and is_current)
        or a.opportunity_id in (select id from opportunities where property_id = ${propertyId})` : sql`false`}
      or ${contactId ? sql`a.contact_id = ${contactId}
        or a.entity_id in (select entity_id from entity_people where contact_id = ${contactId})
        or a.opportunity_id in (select id from opportunities where seller_contact_id = ${contactId} or buyer_contact_id = ${contactId})` : sql`false`}
      or ${entityId ? sql`a.entity_id = ${entityId}
        or a.property_id in (select property_id from property_ownerships where entity_id = ${entityId} and is_current)
        or a.contact_id in (select contact_id from entity_people where entity_id = ${entityId})` : sql`false`}
      or ${opportunityId ? sql`a.opportunity_id = ${opportunityId}` : sql`false`}
    )
    order by a.occurred_at desc limit ${limit}`;
}

export async function openTasks(orgId: string, scope: TimelineScope) {
  const { propertyId, contactId, entityId, opportunityId } = scope;
  return sql`
    select t.*, p.street_address, c.full_name as contact_name, e.name as entity_name, o.name as opp_name
    from tasks t
    left join properties p on p.id = t.property_id
    left join contacts c on c.id = t.contact_id
    left join entities e on e.id = t.entity_id
    left join opportunities o on o.id = t.opportunity_id
    where t.org_id = ${orgId} and t.status = 'open' and (
      ${propertyId ? sql`t.property_id = ${propertyId}` : sql`false`}
      or ${contactId ? sql`t.contact_id = ${contactId}` : sql`false`}
      or ${entityId ? sql`t.entity_id = ${entityId}` : sql`false`}
      or ${opportunityId ? sql`t.opportunity_id = ${opportunityId}` : sql`false`})
    order by t.due_date nulls last, t.priority`;
}

/**
 * Relationship strength 0–100 from actual logged interactions (recency + depth). Pure arithmetic on
 * CRM data, no inference: no activity => 0.
 */
export function relationshipStrength(acts: { type: string; outcome: string | null; occurred_at: Date | string }[]) {
  const touches = acts.filter((a) => ["call", "email", "text", "letter", "meeting", "in_person"].includes(a.type));
  if (!touches.length) return { score: 0, label: "None" };
  const last = Math.max(...touches.map((a) => new Date(a.occurred_at).getTime()));
  const days = (Date.now() - last) / 86400000;
  const recency = days <= 30 ? 40 : days <= 90 ? 30 : days <= 180 ? 18 : days <= 365 ? 8 : 0;
  const convos = touches.filter((a) => ["conversation", "meaningful_conversation", "open_to_selling", "meeting_set"].includes(a.outcome ?? "") || ["meeting", "in_person"].includes(a.type)).length;
  const depth = Math.min(40, convos * 10);
  const volume = Math.min(20, touches.length * 2);
  const score = recency + depth + volume;
  return { score, label: score >= 70 ? "Strong" : score >= 40 ? "Warm" : score >= 15 ? "Light" : "Cold" };
}

export async function orgSettings(orgId: string) {
  const [o] = await sql`select settings from organizations where id = ${orgId}`;
  return { default_commission_rate: Number(o.settings.default_commission_rate ?? 0.03), default_brokerage_split: Number(o.settings.default_brokerage_split ?? 0.7) };
}

/** Commission math used across dashboard + pipeline. Falls back to org defaults when the deal doesn't set them. */
export const commissionSql = (rate: number, split: number) => sql`
  coalesce(o.expected_price, o.asking_price, 0) * coalesce(o.commission_rate, ${rate}) * coalesce(o.brokerage_split, ${split})`;

export async function stages(orgId: string) {
  return sql`select * from pipeline_stages where org_id = ${orgId} order by position`;
}
