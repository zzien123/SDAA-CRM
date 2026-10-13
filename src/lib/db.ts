import postgres from "postgres";

declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
}

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    // serverless: keep each function instance's pool small so Supabase's pooler isn't exhausted
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    prepare: !url.includes("pooler.supabase.com:6543"), // transaction pooler can't use prepared statements
    onnotice: () => {},
    connection: { search_path: "crm,public,extensions" },
    types: {
      numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      // DATE columns stay 'YYYY-MM-DD' strings: no timezone shifting (a due date of Oct 13 must not render as Oct 12 in Pacific time)
      date: { to: 1082, from: [1082], serialize: (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x)), parse: (x: string) => x },
    },
  });
}

export const sql = globalThis.__sql ?? make();
if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;
export type Sql = typeof sql;
