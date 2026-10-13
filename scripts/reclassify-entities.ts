// Re-runs the entity-type classifier on imported owners (manual edits are left alone).
import { sql } from "../src/lib/db";
import { classifyEntity } from "../src/lib/normalize";
async function main() {
  const rows = await sql`select id, name, entity_type from entities where source like 'Import:%'`;
  let n = 0;
  for (const r of rows) {
    const t = classifyEntity(r.name);
    if (t !== r.entity_type) { await sql`update entities set entity_type = ${t} where id = ${r.id}`; n++; }
  }
  console.log(`reclassified ${n} of ${rows.length}`);
  await sql.end();
}
main();
