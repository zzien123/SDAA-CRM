import "server-only";
import { sql } from "./db";

export const OUTCOMES = {
  no_answer:       { label: "No answer",       status: "attempting",     days: 3,   counts: true },
  left_voicemail:  { label: "Left voicemail",  status: "attempting",     days: 4,   counts: true },
  sent:            { label: "Sent (letter/email/text)", status: "attempting", days: 10, counts: true },
  wrong_number:    { label: "Wrong number",    status: "attempting",     days: 7,   counts: true },
  conversation:    { label: "Talked — not now", status: "connected",     days: 90,  counts: true },
  meaningful_conversation: { label: "Good conversation", status: "connected", days: 30, counts: true },
  open_to_selling: { label: "Open to selling", status: "interested",     days: 7,   counts: true },
  meeting_set:     { label: "Meeting set",     status: "interested",     days: 7,   counts: true },
  not_interested:  { label: "Not interested",  status: "not_interested", days: 180, counts: true },
  do_not_contact:  { label: "Do not contact",  status: "do_not_contact", days: null, counts: true },
} as const;
export type Outcome = keyof typeof OUTCOMES;

export const STATUS_LABEL: Record<string, string> = {
  queued: "Not yet contacted", attempting: "Attempting", connected: "Connected", interested: "Interested",
  not_interested: "Not interested", do_not_contact: "Do not contact", converted: "Converted to deal", skipped: "Skipped",
};

/** One row per owner in the list; the queue works owners, not parcels. */
export function ownerRows(orgId: string, listId: string) {
  return sql`
    select i.entity_id, e.name, e.entity_type, e.phone, e.phone_shared_count, e.mailing_city, e.mailing_state,
           (array_agg(i.status order by i.updated_at desc))[1] as status,
           min(i.priority)::int as priority, max(i.attempts)::int as attempts, max(i.last_attempt_at) as last_attempt_at,
           min(i.next_action_date) as next_action_date, (array_agg(i.next_action order by i.updated_at desc))[1] as next_action,
           count(*)::int as props, coalesce(sum(p.units),0)::int as units, min(p.last_sale_date) as oldest_sale,
           (array_agg(p.street_address order by p.units desc nulls last))[1] as top_address,
           bool_or(ec.owner_suppressed) as suppressed, bool_or(ec.phone_suppressed) as phone_suppressed
    from prospect_list_items i
    join entities e on e.id = i.entity_id
    join properties p on p.id = i.property_id
    join entity_contactability ec on ec.entity_id = e.id
    where i.org_id = ${orgId} and i.list_id = ${listId}
    group by i.entity_id, e.id`;
}

/** Due owners first (follow-ups by status heat), then fresh owners by priority and size. */
export function queueOrder(today: string) {
  return sql`
    order by
      (status in ('do_not_contact','converted','skipped') or suppressed) asc,
      (next_action_date is not null and next_action_date <= ${today}) desc,
      case status when 'interested' then 0 when 'connected' then 1 when 'attempting' then 2 when 'queued' then 3 else 4 end,
      priority, units desc, entity_id`;
}
