import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import {
  apnDisplay, apnKey, classifyEntity, clean, CONSTRUCTION_TYPES, displayCase, formatPhone,
  looksLikePhone, normalizeAddress, normalizeName, propertyTypeFromUnits, toDate, toNumber, zip5,
} from "../normalize";
import type { FieldKey, Mapping } from "./fields";

export type ImportStats = {
  rows_read: number;
  rows_rejected: number;
  properties_created: number;
  properties_matched: number;
  properties_updated: number;
  parcels_created: number;
  entities_created: number;
  entities_matched: number;
  ownerships_created: number;
  ownership_reviews_created: number;
  flags: Record<string, number>;
};

type Owner = {
  key: string; name: string; nameNorm: string; type: string;
  careOf: string | null; address: string | null; city: string | null; state: string | null; zip: string | null;
  mailingNorm: string; phone: string | null;
};

type NormRow = {
  rowNumber: number;
  apn: string | null; apnRaw: string | null;
  property: {
    street_address: string; address_normalized: string; city: string | null; zip: string | null;
    units: number | null; year_built: number | null; floors: number | null; construction_type: string | null;
    building_sf: number | null; lot_sf: number | null; zoning: string | null;
    land_value: number | null; improvement_value: number | null;
    last_sale_date: string | null; last_sale_price: number | null; property_type: string | null;
    data_flags: string[];
  };
  owner: Owner;
  second: Owner | null;
};

type Rejection = { rowNumber: number; reason: string; raw: Record<string, unknown> };

const MAX_PLAUSIBLE_UNITS = 2000;
const SOURCE_PREFIX = "Import: ";

function makeOwner(name: string, careOf: unknown, addr: unknown, city: unknown, state: unknown, zip: unknown, phone: unknown): Owner {
  const nameNorm = normalizeName(name);
  const address = displayCase(clean(addr));
  const z = zip5(zip);
  const mailingNorm = [normalizeAddress(clean(addr)), z ?? ""].join("|");
  return {
    key: `${nameNorm}#${mailingNorm}`,
    name: displayCase(name) ?? name,
    nameNorm,
    type: classifyEntity(name),
    careOf: displayCase(clean(careOf)),
    address, city: displayCase(clean(city)), state: clean(state)?.toUpperCase().slice(0, 2) ?? null, zip: z,
    mailingNorm, phone: formatPhone(phone),
  };
}

export function normalizeRows(rows: Record<string, unknown>[], mapping: Mapping): { good: NormRow[]; rejected: Rejection[] } {
  const good: NormRow[] = [];
  const rejected: Rejection[] = [];
  const get = (r: Record<string, unknown>, f: FieldKey) => (mapping[f] ? r[mapping[f]!] : undefined);

  rows.forEach((r, i) => {
    const rowNumber = i + 2;
    const reject = (reason: string) => rejected.push({ rowNumber, reason, raw: r });
    if (r.__overflow !== undefined) return reject("Row has more values than headers (columns shifted)");
    const apnRaw = clean(get(r, "apn"));
    if (apnRaw && looksLikePhone(apnRaw)) return reject("Phone number found in APN column (columns shifted)");
    const addr = clean(get(r, "street_address"));
    const ownerName = clean(get(r, "owner_name"));
    if (!addr) return reject("Missing property address");
    if (!ownerName) return reject("Missing owner name");
    const unitsRaw = get(r, "units");
    const unitsNum = toNumber(unitsRaw);
    if (clean(unitsRaw) !== null && unitsNum === null) return reject(`Non-numeric unit count "${clean(unitsRaw)}"`);
    if (apnRaw && /^\d{3}\s+\d{3}\s+\d{3}/.test(addr)) return reject("APN found in address column (columns shifted)");

    const flags: string[] = [];
    let units: number | null = unitsNum === null ? null : Math.round(unitsNum);
    if (units === 0 || units === null) { flags.push("units_unknown"); units = null; }
    else if (units > MAX_PLAUSIBLE_UNITS) { flags.push(`units_outlier:${units}`); units = null; }

    let yb = toNumber(get(r, "year_built"));
    if (yb !== null && (yb < 1850 || yb > new Date().getFullYear() + 2)) { flags.push(`year_built_invalid:${yb}`); yb = null; }

    let ct = clean(get(r, "construction_type"))?.toUpperCase() ?? null;
    if (ct && !CONSTRUCTION_TYPES.has(ct)) { flags.push("construction_type_suspect"); ct = null; }
    if (ct === "UNKNOWN") ct = null;

    const floorsN = toNumber(get(r, "floors"));
    const saleRaw = get(r, "last_sale_date");
    const sale = toDate(saleRaw);
    if (!sale) flags.push("sale_date_missing");
    const apn = apnKey(apnRaw);
    if (!apn) flags.push("missing_apn");
    if (/^\d+-\d+\s/.test(addr)) flags.push("address_range");
    const zip = zip5(get(r, "zip"));
    if (!zip) flags.push("missing_zip");

    const owner = makeOwner(ownerName, get(r, "care_of"), get(r, "owner_address"), get(r, "owner_city"), get(r, "owner_state"), get(r, "owner_zip"), get(r, "owner_phone"));
    const secondName = clean(get(r, "second_owner_name"));
    const second = secondName && normalizeName(secondName) !== owner.nameNorm
      ? makeOwner(secondName, null, get(r, "owner_address"), get(r, "owner_city"), get(r, "owner_state"), get(r, "owner_zip"), null)
      : null;
    if (second) second.phone = null; // phone on the roll belongs to the mailing party, not attributed twice

    good.push({
      rowNumber, apn, apnRaw,
      property: {
        street_address: displayCase(addr)!,
        address_normalized: normalizeAddress(addr),
        city: displayCase(clean(get(r, "city"))),
        zip,
        units,
        year_built: yb,
        floors: floorsN !== null && floorsN > 0 && floorsN < 100 ? Math.round(floorsN) : null,
        construction_type: ct,
        building_sf: toNumber(get(r, "building_sf")),
        lot_sf: toNumber(get(r, "lot_sf")),
        zoning: clean(get(r, "zoning")),
        land_value: toNumber(get(r, "land_value")),
        improvement_value: toNumber(get(r, "improvement_value")),
        last_sale_date: sale,
        last_sale_price: toNumber(get(r, "last_sale_price")),
        property_type: propertyTypeFromUnits(units),
        data_flags: flags,
      },
      owner, second,
    });
  });
  return { good, rejected };
}

async function chunkInsert(sql: Sql, table: string, rows: Record<string, unknown>[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    await sql`insert into ${sql(table)} ${sql(chunk as never)}`;
  }
}

export async function runPropertyOwnerImport(opts: {
  sql: Sql; orgId: string; userId: string | null; filename: string;
  rows: Record<string, unknown>[]; mapping: Mapping;
}): Promise<{ importId: string; stats: ImportStats }> {
  const { sql, orgId, userId, filename, rows, mapping } = opts;
  const importId = randomUUID();
  const source = SOURCE_PREFIX + filename;
  await sql`insert into imports (id, org_id, filename, kind, mapping, created_by)
            values (${importId}, ${orgId}, ${filename}, 'property_owner_list', ${sql.json(mapping as never)}, ${userId})`;

  try {
    const { good, rejected } = normalizeRows(rows, mapping);
    const stats: ImportStats = {
      rows_read: rows.length, rows_rejected: rejected.length,
      properties_created: 0, properties_matched: 0, properties_updated: 0, parcels_created: 0,
      entities_created: 0, entities_matched: 0, ownerships_created: 0, ownership_reviews_created: 0, flags: {},
    };

    // ---- existing state
    const existingParcels = new Map<string, string>();
    for (const r of await sql`select apn, property_id from parcels where org_id = ${orgId}`) existingParcels.set(r.apn.replace(/\D/g, ""), r.property_id);
    const existingAddr = new Map<string, string>();
    for (const r of await sql`select id, address_normalized, upper(coalesce(city,'')) as city from properties where org_id = ${orgId}`)
      existingAddr.set(`${r.address_normalized}|${r.city}`, r.id);
    const existingEntities = new Map<string, string>();
    for (const r of await sql`select id, name_normalized, coalesce(mailing_normalized,'') as m from entities where org_id = ${orgId}`)
      existingEntities.set(`${r.name_normalized}#${r.m}`, r.id);

    // ---- resolve entities
    const newEntities: Record<string, unknown>[] = [];
    const entityIdFor = (o: Owner): string => {
      const hit = existingEntities.get(o.key);
      if (hit) return hit;
      const id = randomUUID();
      existingEntities.set(o.key, id);
      newEntities.push({
        id, org_id: orgId, name: o.name, name_normalized: o.nameNorm, entity_type: o.type,
        care_of_name: o.careOf, mailing_address: o.address, mailing_city: o.city, mailing_state: o.state,
        mailing_zip: o.zip, mailing_normalized: o.mailingNorm, phone: o.phone, phone_source: o.phone ? source : null,
        source, source_import_id: importId,
      });
      return id;
    };
    const matchedEntityIds = new Set<string>();
    const preexisting = new Set(existingEntities.values());

    // ---- resolve properties (dedupe by APN, then normalized address + city)
    const newProps: Record<string, unknown>[] = [];
    const newParcels: Record<string, unknown>[] = [];
    const newOwnerships: Record<string, unknown>[] = [];
    const reviews: Record<string, unknown>[] = [];
    const touchedExisting = new Map<string, NormRow>();
    const ownershipSeen = new Set<string>();
    const ownerOfRecordFor = new Map<string, string>();
    const createdPropIds = new Set<string>();
    const buildingKeys = new Map<string, string>();
    const newPropsById = new Map<string, Record<string, unknown>>();

    for (const row of good) {
      for (const f of row.property.data_flags) {
        const k = f.split(":")[0];
        stats.flags[k] = (stats.flags[k] ?? 0) + 1;
      }
      const addrKey = `${row.property.address_normalized}|${(row.property.city ?? "").toUpperCase()}`;
      // County lists repeat a complex's totals (units + land + improvement value) on every parcel of the complex.
      // Same owner + identical totals => one property with several APNs, not N copies of the building.
      const p = row.property;
      const buildingKey = p.units && p.land_value && p.improvement_value ? `${row.owner.key}|${p.units}|${p.land_value}|${p.improvement_value}` : null;
      let propertyId = (row.apn && existingParcels.get(row.apn)) || existingAddr.get(addrKey) || (buildingKey ? buildingKeys.get(buildingKey) : undefined);
      if (propertyId && row.apn && !existingParcels.has(row.apn)) {
        const created = newPropsById.get(propertyId);
        if (created && !(created.data_flags as string[]).includes("multi_parcel")) (created.data_flags as string[]).push("multi_parcel");
        stats.flags.multi_parcel = (stats.flags.multi_parcel ?? 0) + 1;
      }
      const isNew = !propertyId;
      if (!propertyId) {
        propertyId = randomUUID();
        createdPropIds.add(propertyId);
        const prop = { id: propertyId, org_id: orgId, ...row.property, data_flags: [...row.property.data_flags], source, source_import_id: importId, created_by: userId };
        newProps.push(prop);
        newPropsById.set(propertyId, prop);
        existingAddr.set(addrKey, propertyId);
        if (buildingKey) buildingKeys.set(buildingKey, propertyId);
      } else if (!createdPropIds.has(propertyId)) {
        touchedExisting.set(propertyId, row);
      }
      if (row.apn && !existingParcels.has(row.apn)) {
        existingParcels.set(row.apn, propertyId);
        newParcels.push({ id: randomUUID(), org_id: orgId, property_id: propertyId, apn: apnDisplay(row.apnRaw), apn_raw: row.apnRaw, situs_address: row.property.street_address });
      }

      const ownerId = entityIdFor(row.owner);
      if (preexisting.has(ownerId)) matchedEntityIds.add(ownerId);
      const parties: [string, string][] = [[ownerId, "owner_of_record"]];
      if (row.second) parties.push([entityIdFor(row.second), "second_name_on_title"]);

      for (const [entityId, role] of parties) {
        const k = `${propertyId}|${entityId}|${role}`;
        if (ownershipSeen.has(k)) continue;
        ownershipSeen.add(k);
        // duplicate APN rows inside one file with a different owner => co-owner, not a replacement
        let effectiveRole = role;
        if (role === "owner_of_record") {
          const first = ownerOfRecordFor.get(propertyId);
          if (first && first !== entityId) effectiveRole = "co_owner";
          else ownerOfRecordFor.set(propertyId, entityId);
        }
        if (isNew || createdPropIds.has(propertyId)) {
          newOwnerships.push({
            id: randomUUID(), org_id: orgId, property_id: propertyId, entity_id: entityId, vesting_role: effectiveRole,
            start_date: role === "owner_of_record" ? row.property.last_sale_date : null,
            source, confidence: "public_record", source_import_id: importId,
          });
        }
      }
    }

    // ---- existing properties: fill blanks only, route owner changes to review
    const updates: { id: string; previous: Record<string, unknown>; set: Record<string, unknown> }[] = [];
    if (touchedExisting.size) {
      const ids = [...touchedExisting.keys()];
      const current = await sql`select * from properties where id = any(${ids})`;
      const owners = await sql`select property_id, entity_id from property_ownerships
                               where property_id = any(${ids}) and is_current and vesting_role = 'owner_of_record'`;
      const ownerMap = new Map(owners.map((o) => [o.property_id as string, o.entity_id as string]));
      for (const cur of current) {
        stats.properties_matched++;
        const row = touchedExisting.get(cur.id)!;
        const fill: Record<string, unknown> = {};
        const prev: Record<string, unknown> = {};
        for (const f of ["units", "year_built", "floors", "construction_type", "building_sf", "lot_sf", "zoning", "land_value",
                         "improvement_value", "last_sale_date", "last_sale_price", "property_type", "zip"] as const) {
          const v = row.property[f];
          if (v !== null && v !== undefined && (cur[f] === null || cur[f] === undefined)) { fill[f] = v; prev[f] = null; }
        }
        if (Object.keys(fill).length) updates.push({ id: cur.id, previous: prev, set: fill });

        const newOwner = existingEntities.get(row.owner.key)!;
        const curOwner = ownerMap.get(cur.id);
        if (!curOwner) {
          newOwnerships.push({ id: randomUUID(), org_id: orgId, property_id: cur.id, entity_id: newOwner, vesting_role: "owner_of_record",
            start_date: row.property.last_sale_date, source, confidence: "public_record", source_import_id: importId });
        } else if (curOwner !== newOwner) {
          reviews.push({ id: randomUUID(), org_id: orgId, property_id: cur.id, current_entity_id: curOwner, proposed_entity_id: newOwner,
            proposed_sale_date: row.property.last_sale_date, source, import_id: importId });
        }
      }
    }

    // ---- write
    await sql.begin(async (tx) => {
      const t = tx as unknown as Sql;
      await chunkInsert(t, "entities", newEntities);
      await chunkInsert(t, "properties", newProps);
      await chunkInsert(t, "parcels", newParcels);
      await chunkInsert(t, "property_ownerships", newOwnerships);
      await chunkInsert(t, "ownership_reviews", reviews);
      for (const u of updates) {
        await t`update properties set ${t(u.set as never)} where id = ${u.id}`;
      }
      const recs: Record<string, unknown>[] = [
        ...newEntities.map((e) => ({ import_id: importId, table_name: "entities", record_id: e.id, action: "created" })),
        ...newProps.map((p) => ({ import_id: importId, table_name: "properties", record_id: p.id, action: "created" })),
        ...newParcels.map((p) => ({ import_id: importId, table_name: "parcels", record_id: p.id, action: "created" })),
        ...newOwnerships.map((p) => ({ import_id: importId, table_name: "property_ownerships", record_id: p.id, action: "created" })),
        ...updates.map((u) => ({ import_id: importId, table_name: "properties", record_id: u.id, action: "updated", previous: t.json(u.previous as never) })),
      ];
      await chunkInsert(t, "import_records", recs.map((r) => ({ previous: null, ...r })), 2000);
      await chunkInsert(t, "import_rejections", rejected.map((r) => ({
        import_id: importId, row_number: r.rowNumber, reason: r.reason,
        raw: t.json(JSON.parse(JSON.stringify(r.raw)) as never),
      })));
      // phones shared across several owner names usually belong to a management company
      await t`update entities e set phone_shared_count = s.n - 1
              from (select phone, count(*)::int as n from entities where org_id = ${orgId} and phone is not null group by phone) s
              where e.org_id = ${orgId} and e.phone = s.phone and e.phone_shared_count is distinct from s.n - 1`;
    });

    stats.properties_created = newProps.length;
    stats.properties_updated = updates.length;
    stats.parcels_created = newParcels.length;
    stats.entities_created = newEntities.length;
    stats.entities_matched = matchedEntityIds.size;
    stats.ownerships_created = newOwnerships.length;
    stats.ownership_reviews_created = reviews.length;

    await sql`update imports set status = 'completed', stats = ${sql.json(stats as never)}, completed_at = now() where id = ${importId}`;
    return { importId, stats };
  } catch (e) {
    await sql`update imports set status = 'failed', error = ${String((e as Error).message)}, completed_at = now() where id = ${importId}`;
    throw e;
  }
}

/** Undo an import. Refuses if you've since built on the imported records (notes, tasks, contacts, deals). */
export async function rollbackImport(sql: Sql, orgId: string, importId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [imp] = await sql`select status from imports where id = ${importId} and org_id = ${orgId}`;
  if (!imp) return { ok: false, reason: "Import not found" };
  if (imp.status !== "completed") return { ok: false, reason: `Import is ${imp.status}` };

  const [conflict] = await sql`
    with created as (select table_name, record_id from import_records where import_id = ${importId} and action = 'created')
    select
      (select count(*) from activities a where a.property_id in (select record_id from created where table_name='properties')
                                            or a.entity_id in (select record_id from created where table_name='entities')
                                            or a.contact_id in (select record_id from created where table_name='contacts'))::int as activities,
      (select count(*) from entity_people ep where ep.contact_id in (select record_id from created where table_name='contacts'))::int as owner_links,
      (select count(*) from opportunities o where o.seller_contact_id in (select record_id from created where table_name='contacts')
                                             or o.buyer_contact_id in (select record_id from created where table_name='contacts'))::int as deals,
      (select count(*) from buyer_criteria b where b.contact_id in (select record_id from created where table_name='contacts'))::int as buyer_profiles,
      (select count(*) from tasks t where t.property_id in (select record_id from created where table_name='properties')
                                     or t.entity_id in (select record_id from created where table_name='entities')
                                     or t.contact_id in (select record_id from created where table_name='contacts'))::int as tasks,
      (select count(*) from entity_people ep where ep.entity_id in (select record_id from created where table_name='entities'))::int as people,
      (select count(*) from opportunities o where o.property_id in (select record_id from created where table_name='properties'))::int as opps,
      (select count(*) from property_ownerships po where po.source_import_id is distinct from ${importId}
          and po.entity_id in (select record_id from created where table_name='entities'))::int as other_links`;
  const blockers = Object.entries(conflict).filter(([, n]) => Number(n) > 0);
  if (blockers.length) {
    return { ok: false, reason: "Records from this import are now used elsewhere: " + blockers.map(([k, n]) => `${n} ${k.replace("_", " ")}`).join(", ") + ". Remove those first or keep the import." };
  }

  await sql.begin(async (tx) => {
    const ids = (t: string) => tx`select record_id from import_records where import_id = ${importId} and action = 'created' and table_name = ${t}`;
    await tx`delete from ownership_reviews where import_id = ${importId}`;
    await tx`delete from property_ownerships where id in (${ids("property_ownerships")})`;
    await tx`delete from parcels where id in (${ids("parcels")})`;
    await tx`delete from properties where id in (${ids("properties")})`;
    await tx`delete from entities where id in (${ids("entities")})`;
    await tx`delete from contacts where id in (${ids("contacts")})`;
    await tx`delete from companies c where id in (${ids("companies")}) and not exists (select 1 from contacts where company_id = c.id)`;
    const ups = await tx`select record_id, previous from import_records where import_id = ${importId} and action = 'updated' and table_name = 'properties'`;
    for (const u of ups) await tx`update properties set ${tx(u.previous as never)} where id = ${u.record_id}`;
    await tx`update imports set status = 'rolled_back', rolled_back_at = now() where id = ${importId}`;
    await tx`update entities e set phone_shared_count = coalesce((select count(*)::int - 1 from entities x
               where x.org_id = e.org_id and x.phone = e.phone), 0) where e.org_id = ${orgId}`;
  });
  return { ok: true };
}
