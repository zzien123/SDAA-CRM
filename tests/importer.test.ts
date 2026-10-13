// Integration test against a throwaway database (TEST_DATABASE_URL).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_unit";

const rows = [
  { OwnerName: "SEAWARD LTD.", InCareOf: "JAY R DE MIRANDA", OwnerAddress: "1251 W REDONDO BEACH BL", OwnerCity: "GARDENA", OwnerState: "CA", OwnerZip: 90247, Owner: "(310) 532-6369", ParcelNo: "638  120 028        1", BldgAddress: "232-60 COTTONWOOD", BldgCity: "SAN YSIDRO", BldgZip: null, Units: 0, YearBuilt: 1970, SaleDate: "00-00-1900", SecondOwnerName: null, Type: "STUCCO", Floors: 2, LandValue: 441630, BldgValue: 836869 },
  { OwnerName: "SYBIL C CALE", InCareOf: null, OwnerAddress: "4634 BARRINGTON CT", OwnerCity: "BONITA", OwnerState: "CA", OwnerZip: 91902, Owner: "(619) 472-5393", ParcelNo: "626  500 017", BldgAddress: "1023-25 12TH ST", BldgCity: "IMPERIAL BEACH", BldgZip: 91932, Units: 4, YearBuilt: 1986, SaleDate: new Date(Date.UTC(2012, 3, 12)), SecondOwnerName: "CALE SURVIVORS TRUST", Type: "UNKNOWN", Floors: null, LandValue: 74757, BldgValue: 335974 },
  { OwnerName: "WERBY L L C", InCareOf: "RICHARD A WERBY-PTR", OwnerAddress: "1770 BLACKBIRD CIR", OwnerCity: "CARLSBAD", OwnerState: "CA", OwnerZip: 92011, Owner: "(760) 603-0007", ParcelNo: "150  375 012", BldgAddress: "901 S TREMONT ST", BldgCity: "OCEANSIDE", BldgZip: 92054, Units: 12, YearBuilt: 1952, SaleDate: new Date(Date.UTC(2003, 0, 30)), SecondOwnerName: null, Type: "UNKNOWN", Floors: null, LandValue: 212980, BldgValue: 298178 },
  // same owner + same mailing address => same entity (portfolio)
  { OwnerName: "WERBY LLC", InCareOf: null, OwnerAddress: "1770 Blackbird Circle", OwnerCity: "CARLSBAD", OwnerState: "CA", OwnerZip: 92011, Owner: "(760) 603-0007", ParcelNo: "150  375 013", BldgAddress: "905 S TREMONT ST", BldgCity: "OCEANSIDE", BldgZip: 92054, Units: 8, YearBuilt: 1955, SaleDate: new Date(Date.UTC(2003, 0, 30)), SecondOwnerName: null, Type: "STUCCO", Floors: 2, LandValue: 1, BldgValue: 1 },
  // same owner, identical complex totals on another parcel => same property, second APN
  { OwnerName: "SYBIL C CALE", InCareOf: null, OwnerAddress: "4634 BARRINGTON CT", OwnerCity: "BONITA", OwnerState: "CA", OwnerZip: 91902, Owner: "(619) 472-5393", ParcelNo: "626  500 018", BldgAddress: "1027 12TH ST", BldgCity: "IMPERIAL BEACH", BldgZip: 91932, Units: 4, YearBuilt: 1986, SaleDate: new Date(Date.UTC(2012, 3, 12)), SecondOwnerName: "CALE SURVIVORS TRUST", Type: "UNKNOWN", Floors: null, LandValue: 74757, BldgValue: 335974 },
  // shifted row => rejected
  { OwnerName: "HENG & AW", InCareOf: "X", OwnerAddress: null, OwnerCity: "3263 CRISTOBAL WAY", OwnerState: "SPRING VALLEY", OwnerZip: "CA", Owner: 91977, ParcelNo: "(760) 344-0888", BldgAddress: "584  480 049", BldgCity: "4086 WINONA AVE", BldgZip: "SAN DIEGO", Units: 92105, YearBuilt: 7, SaleDate: 1974, SecondOwnerName: null, Type: null, Floors: "STUCCO", LandValue: 2, BldgValue: 301816 },
];

let sql: typeof import("../src/lib/db").sql;
let orgId: string;

before(async () => {
  execSync(`psql "${process.env.DATABASE_URL}" -q -c "drop schema if exists crm cascade; drop table if exists public.schema_migrations;"`);
  execSync("npx tsx scripts/migrate.ts", { env: process.env, stdio: "ignore" });
  ({ sql } = await import("../src/lib/db"));
  const { ensureOrg } = await import("../src/lib/org");
  ({ orgId } = await ensureOrg((process.env.ALLOWED_EMAILS = "test@example.com", "test@example.com")));
});
after(async () => { await sql.end(); });

test("import → re-import is idempotent → rollback", async () => {
  const { runPropertyOwnerImport, rollbackImport } = await import("../src/lib/importer/engine");
  const { suggestMapping } = await import("../src/lib/importer/fields");
  const mapping = suggestMapping(Object.keys(rows[0]), rows);
  assert.equal(mapping.owner_phone, "Owner", "phone column detected despite the 'Owner' header");
  assert.equal(mapping.owner_name, "OwnerName");

  const first = await runPropertyOwnerImport({ sql, orgId, userId: null, filename: "t.xlsx", rows, mapping });
  assert.equal(first.stats.rows_rejected, 1);
  assert.equal(first.stats.properties_created, 4);
  assert.equal(first.stats.entities_created, 4, "Seaward, Cale, Cale Survivors Trust, Werby (deduped)");

  const [werby] = await sql`select e.id, e.entity_type, count(po.*)::int as n from entities e join property_ownerships po on po.entity_id = e.id where e.name_normalized = 'WERBY LLC' group by e.id`;
  assert.equal(werby.n, 2, "both Tremont parcels linked to one Werby entity");
  assert.equal(werby.entity_type, "llc");

  const [seaward] = await sql`select units, data_flags, last_sale_date from properties where street_address = '232-60 Cottonwood'`;
  assert.equal(seaward.units, null, "0 units stored as unknown");
  assert.ok(seaward.data_flags.includes("units_unknown"));
  assert.equal(seaward.last_sale_date, null);

  const [merged] = await sql`select count(*)::int as n, (select property_id from parcels where situs_address = '1027 12th St') as pid from parcels
                             where property_id = (select property_id from parcels where situs_address = '1027 12th St')`;
  assert.equal(merged.n, 2, "repeated complex totals merged into one property with 2 APNs");
  const [found] = await sql`select id from properties where search_text like '%1027 12th st%'`;
  assert.equal(found?.id, merged.pid, "second parcel address is searchable");

  const [cale] = await sql`select count(*)::int as n from property_ownerships po join properties p on p.id = po.property_id where p.street_address = '1023-25 12th St' and po.vesting_role = 'second_name_on_title'`;
  assert.equal(cale.n, 1);

  // relationship works both directions
  const [bi] = await sql`select (select count(*) from property_overview where owner_entity_id = ${werby.id})::int as from_entity`;
  assert.equal(bi.from_entity, 2);

  const second = await runPropertyOwnerImport({ sql, orgId, userId: null, filename: "t.xlsx", rows, mapping });
  assert.equal(second.stats.properties_created, 0);
  assert.equal(second.stats.entities_created, 0);
  assert.equal(second.stats.properties_matched, 4);

  // an owner change on re-import goes to review, not overwrite
  const changed = rows.slice(2, 3).map((r) => ({ ...r, OwnerName: "NEW BUYER LLC", OwnerAddress: "1 MAIN ST" }));
  const third = await runPropertyOwnerImport({ sql, orgId, userId: null, filename: "t2.xlsx", rows: changed, mapping });
  assert.equal(third.stats.ownership_reviews_created, 1);
  const [still] = await sql`select owner_name from property_overview where street_address = '901 S Tremont St'`;
  assert.equal(still.owner_name, "Werby LLC");

  // rollback blocked once you've logged work against imported records
  const [p] = await sql`select id from properties where street_address = '901 S Tremont St'`;
  await sql`insert into activities (org_id, type, body, property_id) values (${orgId}, 'note', 'test', ${p.id})`;
  const blocked = await rollbackImport(sql, orgId, first.importId);
  assert.equal(blocked.ok, false);
  await sql`delete from activities where property_id = ${p.id}`;

  assert.deepEqual(await rollbackImport(sql, orgId, third.importId), { ok: true });
  assert.deepEqual(await rollbackImport(sql, orgId, first.importId), { ok: true });
  const [left] = await sql`select (select count(*) from properties)::int as p, (select count(*) from entities)::int as e`;
  assert.deepEqual(left, { p: 0, e: 0 });
});
