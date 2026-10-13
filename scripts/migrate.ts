// Applies db/migrations/*.sql in order, once each. Usage: npm run db:migrate
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
// prepare:false so this also works through Supabase's transaction pooler (port 6543)
const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });

async function main() {
  await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz default now())`;
  const done = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name as string));
  const dir = join(process.cwd(), "db", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    console.log("applying", f);
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, f), "utf8"));
      await tx`insert into public.schema_migrations(name) values (${f})`;
    });
  }
  console.log("migrations up to date");
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
