import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseFile } from "@/lib/importer/parse";
import { runPropertyOwnerImport } from "@/lib/importer/engine";
import { runContactImport } from "@/lib/importer/contacts";

export const maxDuration = 300;

export async function POST(req: Request) {
  const s = await requireSession();
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "property_owner_list");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  try {
    const mapping = JSON.parse(String(form.get("mapping") ?? "{}"));
    const parsed = await parseFile(await file.arrayBuffer(), file.name);
    const res = kind === "contacts"
      ? await runContactImport({ sql, orgId: s.orgId, userId: s.userId, filename: file.name, rows: parsed.rows, mapping, category: String(form.get("category") ?? "") || null })
      : await runPropertyOwnerImport({ sql, orgId: s.orgId, userId: s.userId, filename: file.name, rows: parsed.rows, mapping });
    revalidatePath("/", "layout");
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
