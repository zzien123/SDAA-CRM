// CLI import: npm run import:file -- path/to/file.xlsx
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { sql } from "../src/lib/db";
import { parseFile } from "../src/lib/importer/parse";
import { suggestMapping } from "../src/lib/importer/fields";
import { runPropertyOwnerImport } from "../src/lib/importer/engine";
import { ensureOrg } from "../src/lib/org";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: import-file <path>");
  const { orgId, userId } = await ensureOrg(process.env.DEV_USER_EMAIL ?? "dev@example.com");
  const t0 = Date.now();
  const parsed = await parseFile(readFileSync(path), basename(path));
  const mapping = suggestMapping(parsed.headers, parsed.rows.slice(0, 200));
  console.log("mapping", mapping);
  const res = await runPropertyOwnerImport({ sql, orgId, userId, filename: basename(path), rows: parsed.rows, mapping });
  console.log(JSON.stringify(res, null, 2), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
