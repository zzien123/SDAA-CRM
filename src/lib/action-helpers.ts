import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "./db";
import type { Session } from "./auth";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export function fd(form: FormData) {
  const o: Record<string, string | null> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    o[k] = t === "" ? null : t;
  }
  return o;
}
export const optNum = z.preprocess((v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(/[$,%\s]/g, ""))), z.number().finite().nullable());
export const optInt = z.preprocess((v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(/[,\s]/g, ""))), z.number().int().nullable());
export const optStr = z.string().nullable().optional().transform((v) => v ?? null);
export const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((v) => v ?? null);
export const optUuid = z.string().uuid().nullable().optional().transform((v) => v ?? null);

const OWNED = ["properties", "contacts", "entities", "opportunities", "companies", "tasks", "buyer_criteria", "pipeline_stages", "imports",
  "ownership_reviews", "entity_people", "property_contacts", "activities", "parcels", "property_ownerships", "prospect_lists", "prospect_list_items", "suppressions"] as const;
export type Owned = (typeof OWNED)[number];

/** Throws unless the row exists and belongs to the caller's org. */
export async function assertOwned(s: Session, table: Owned, id: string | null | undefined) {
  if (!id) return;
  if (!OWNED.includes(table)) throw new Error("Bad table");
  const [r] = await sql`select 1 from ${sql(table)} where id = ${id} and org_id = ${s.orgId}`;
  if (!r) throw new Error(`Not found: ${table}`);
}
export async function audit(s: Session, table: string, id: string | null, action: string, changes?: unknown) {
  await sql`insert into audit_log (org_id, user_id, table_name, record_id, action, changes)
            values (${s.orgId}, ${s.userId}, ${table}, ${id}, ${action}, ${changes ? sql.json(changes as never) : null})`;
}
export function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: false, error: (e as Error).message ?? "Something went wrong" };
}
export function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
  revalidatePath("/");
}
