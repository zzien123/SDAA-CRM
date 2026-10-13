// npm run import:rollback -- <importId>
import { sql } from "../src/lib/db";
import { rollbackImport } from "../src/lib/importer/engine";
async function main() {
  const [imp] = await sql`select org_id from imports where id = ${process.argv[2]}`;
  console.log(await rollbackImport(sql, imp.org_id, process.argv[2]));
  await sql.end();
}
main();
