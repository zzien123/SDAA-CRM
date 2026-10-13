import { randomUUID } from "node:crypto";
import { sql } from "./db";

export class AccessDenied extends Error {}

function allowed(email: string) {
  const list = (process.env.ALLOWED_EMAILS ?? process.env.DEV_USER_EMAIL ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Resolves the user's organization. New users are admitted only if their email is in ALLOWED_EMAILS;
 * the first one becomes admin, later ones join as broker. Existing members always pass.
 */
export async function ensureOrg(email: string, authUserId?: string, fullName?: string | null) {
  const [existing] = await sql`select id from users where lower(email) = lower(${email})`;
  if (existing) {
    const [m] = await sql`select org_id, role from memberships where user_id = ${existing.id} limit 1`;
    if (m) return { orgId: m.org_id as string, userId: existing.id as string, role: m.role as string };
  }
  if (!allowed(email)) throw new AccessDenied(`${email} is not on the ALLOWED_EMAILS list`);
  const userId: string = existing?.id ?? authUserId ?? randomUUID();
  if (!existing) await sql`insert into users (id, email, full_name) values (${userId}, ${email}, ${fullName ?? null})`;
  const [{ id: orgId }] = await sql`select crm.bootstrap_org(${process.env.ORG_NAME ?? "My Brokerage"}) as id`;
  const [{ n }] = await sql`select count(*)::int as n from memberships where org_id = ${orgId}`;
  const role = n === 0 ? "admin" : "broker";
  await sql`insert into memberships (org_id, user_id, role) values (${orgId}, ${userId}, ${role}) on conflict do nothing`;
  return { orgId: orgId as string, userId, role };
}
