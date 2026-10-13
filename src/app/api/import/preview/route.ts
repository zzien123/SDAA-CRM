import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseFile } from "@/lib/importer/parse";
import { PROPERTY_OWNER_FIELDS, suggestMapping, type Mapping } from "@/lib/importer/fields";
import { CONTACT_FIELDS, suggestContactMapping } from "@/lib/importer/contacts";
import { normalizeRows } from "@/lib/importer/engine";

export const maxDuration = 60;

export async function POST(req: Request) {
  const s = await requireSession();
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "property_owner_list");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "File over 25 MB — use the CLI importer" }, { status: 400 });
  try {
    const parsed = await parseFile(await file.arrayBuffer(), file.name);
    const sample = parsed.rows.slice(0, 200);
    const mappingRaw = form.get("mapping");
    if (kind === "contacts") {
      const mapping = mappingRaw ? JSON.parse(String(mappingRaw)) : suggestContactMapping(parsed.headers);
      return NextResponse.json({ kind, headers: parsed.headers, rowCount: parsed.rows.length, mapping, fields: CONTACT_FIELDS, sample: parsed.rows.slice(0, 8) });
    }
    const mapping: Mapping = mappingRaw ? JSON.parse(String(mappingRaw)) : suggestMapping(parsed.headers, sample);
    // dry run on the full file: rejections, flags and how many APNs already exist
    const { good, rejected } = normalizeRows(parsed.rows, mapping);
    const apns = good.map((g) => g.apn).filter(Boolean) as string[];
    const [{ existing }] = await sql`select count(*)::int as existing from parcels where org_id = ${s.orgId}
                                     and regexp_replace(apn, '\\D', '', 'g') = any(${apns})`;
    const flags: Record<string, number> = {};
    for (const g of good) for (const f of g.property.data_flags) { const k = f.split(":")[0]; flags[k] = (flags[k] ?? 0) + 1; }
    return NextResponse.json({
      kind, headers: parsed.headers, rowCount: parsed.rows.length, mapping, fields: PROPERTY_OWNER_FIELDS,
      sample: parsed.rows.slice(0, 8),
      normalizedSample: good.slice(0, 8).map((g) => ({ row: g.rowNumber, apn: g.apnRaw, ...g.property, owner: g.owner.name, owner_type: g.owner.type, second_owner: g.second?.name ?? null, phone: g.owner.phone })),
      dryRun: { ok: good.length, rejected: rejected.length, rejections: rejected.slice(0, 20).map((r) => ({ row: r.rowNumber, reason: r.reason })), existingParcels: existing, flags },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
