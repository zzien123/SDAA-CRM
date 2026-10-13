import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { clean, displayCase, formatPhone, phoneDigits, zip5 } from "../normalize";

export const CONTACT_FIELDS = [
  { key: "first_name", label: "First name", group: "Person" }, { key: "last_name", label: "Last name", group: "Person" },
  { key: "full_name", label: "Full name (if not split)", group: "Person" }, { key: "company", label: "Company", group: "Person" },
  { key: "title", label: "Title", group: "Person" }, { key: "email", label: "Email", group: "Contact" }, { key: "email2", label: "Email 2", group: "Contact" },
  { key: "phone", label: "Phone", group: "Contact" }, { key: "phone2", label: "Phone 2", group: "Contact" },
  { key: "address", label: "Mailing address", group: "Contact" }, { key: "city", label: "City", group: "Contact" }, { key: "state", label: "State", group: "Contact" },
  { key: "zip", label: "ZIP", group: "Contact" }, { key: "notes", label: "Notes", group: "Other" }, { key: "source", label: "Source", group: "Other" },
] as const;
type Key = (typeof CONTACT_FIELDS)[number]["key"];
export type ContactMapping = Partial<Record<Key, string>>;

const SYN: Record<Key, string[]> = {
  first_name: ["firstname", "first", "givenname"], last_name: ["lastname", "last", "surname", "familyname"], full_name: ["name", "fullname", "contactname"],
  company: ["company", "companyname", "organization", "firm"], title: ["title", "jobtitle", "position"],
  email: ["email", "emailaddress", "email1", "primaryemail"], email2: ["email2", "secondaryemail", "otheremail"],
  phone: ["phone", "mobile", "cell", "mobilephone", "phone1", "primaryphone", "phonenumber"], phone2: ["phone2", "workphone", "officephone", "homephone", "otherphone"],
  address: ["address", "mailingaddress", "street", "address1"], city: ["city"], state: ["state", "st"], zip: ["zip", "zipcode", "postalcode"],
  notes: ["notes", "note", "comments"], source: ["source", "leadsource"],
};
export function suggestContactMapping(headers: string[]): ContactMapping {
  const m: ContactMapping = {};
  const used = new Set<string>();
  for (const k of Object.keys(SYN) as Key[]) {
    const h = headers.find((x) => !used.has(x) && SYN[k].includes(x.toLowerCase().replace(/[^a-z0-9]/g, "")));
    if (h) { m[k] = h; used.add(h); }
  }
  return m;
}

/**
 * Contacts import. Matches existing people ONLY on email or phone. A same-name match with no shared
 * identifier creates a new contact and is reported as a possible duplicate for human review.
 */
export async function runContactImport(o: { sql: Sql; orgId: string; userId: string | null; filename: string; rows: Record<string, unknown>[]; mapping: ContactMapping; category: string | null }) {
  const { sql, orgId, userId, filename, rows, mapping, category } = o;
  const importId = randomUUID();
  await sql`insert into imports (id, org_id, filename, kind, mapping, created_by) values (${importId}, ${orgId}, ${filename}, 'contacts', ${sql.json(mapping as never)}, ${userId})`;
  const get = (r: Record<string, unknown>, k: Key) => (mapping[k] ? clean(r[mapping[k]!]) : null);
  const stats = { rows_read: rows.length, rows_rejected: 0, contacts_created: 0, contacts_matched: 0, possible_duplicates: 0 };
  try {
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const r of await sql`select c.id, lower(e.email) as email from contacts c join contact_emails e on e.contact_id = c.id where c.org_id = ${orgId}`) byEmail.set(r.email, r.id);
    for (const r of await sql`select c.id, p.phone_digits from contacts c join contact_phones p on p.contact_id = c.id where c.org_id = ${orgId}`) byPhone.set(r.phone_digits, r.id);
    for (const r of await sql`select id, lower(full_name) as n from contacts where org_id = ${orgId}`) byName.set(r.n, r.id);
    const companies = new Map<string, string>();
    for (const r of await sql`select id, lower(name) as n from companies where org_id = ${orgId}`) companies.set(r.n, r.id);

    const newCompanies: Record<string, unknown>[] = [], newContacts: Record<string, unknown>[] = [], phones: Record<string, unknown>[] = [],
      emails: Record<string, unknown>[] = [], cats: Record<string, unknown>[] = [], rejections: Record<string, unknown>[] = [], dupes: string[] = [];
    const source = "Import: " + filename;

    rows.forEach((r, i) => {
      let first = get(r, "first_name"), last = get(r, "last_name");
      const full = get(r, "full_name");
      if (!first && !last && full) {
        const parts = full.includes(",") ? full.split(",").map((x) => x.trim()).reverse() : [full];
        const words = parts.join(" ").split(/\s+/);
        last = words.length > 1 ? words.pop()! : null; first = words.join(" ");
      }
      if (!first && !last) { rejections.push({ import_id: importId, row_number: i + 2, reason: "No name", raw: sql.json(JSON.parse(JSON.stringify(r))) }); return; }
      const em = [get(r, "email"), get(r, "email2")].filter((x): x is string => !!x && /^\S+@\S+\.\S+$/.test(x)).map((x) => x.toLowerCase());
      const ph = [get(r, "phone"), get(r, "phone2")].map(phoneDigits).filter((x): x is string => !!x);
      const match = em.map((e) => byEmail.get(e)).find(Boolean) ?? ph.map((p) => byPhone.get(p)).find(Boolean);
      if (match) { stats.contacts_matched++; return; } // existing record wins; nothing overwritten
      const id = randomUUID();
      const name = `${first ?? ""} ${last ?? ""}`.trim().toLowerCase();
      if (byName.has(name)) { stats.possible_duplicates++; dupes.push(`${displayCase(first)} ${displayCase(last)} (row ${i + 2})`); }
      byName.set(name, id);
      let companyId: string | null = null;
      const co = get(r, "company");
      if (co) {
        companyId = companies.get(co.toLowerCase()) ?? null;
        if (!companyId) { companyId = randomUUID(); companies.set(co.toLowerCase(), companyId); newCompanies.push({ id: companyId, org_id: orgId, name: co }); }
      }
      newContacts.push({ id, org_id: orgId, first_name: displayCase(first), last_name: displayCase(last), company_id: companyId, title: get(r, "title"),
        mailing_address: displayCase(get(r, "address")), mailing_city: displayCase(get(r, "city")), mailing_state: get(r, "state")?.toUpperCase().slice(0, 2) ?? null,
        mailing_zip: zip5(get(r, "zip")), personal_notes: get(r, "notes"), relationship_source: get(r, "source") ?? source, source_import_id: importId, owner_user_id: userId });
      em.forEach((e, j) => { emails.push({ id: randomUUID(), contact_id: id, email: e, is_primary: j === 0, source }); byEmail.set(e, id); });
      ph.forEach((p, j) => { phones.push({ id: randomUUID(), contact_id: id, phone: formatPhone(p), phone_digits: p, is_primary: j === 0, label: j === 0 ? "mobile" : "other", source }); byPhone.set(p, id); });
      if (category) cats.push({ contact_id: id, category });
    });
    stats.rows_rejected = rejections.length;
    stats.contacts_created = newContacts.length;
    const ins = async (t: Sql, table: string, list: Record<string, unknown>[]) => { for (let i = 0; i < list.length; i += 1000) await t`insert into ${t(table)} ${t(list.slice(i, i + 1000) as never)}`; };
    await sql.begin(async (tx) => {
      const t = tx as unknown as Sql;
      await ins(t, "companies", newCompanies);
      await ins(t, "contacts", newContacts);
      await ins(t, "contact_emails", emails);
      await ins(t, "contact_phones", phones);
      await ins(t, "contact_categories", cats);
      await ins(t, "import_rejections", rejections);
      await ins(t, "import_records", [
        ...newContacts.map((c) => ({ import_id: importId, table_name: "contacts", record_id: c.id, action: "created", previous: null })),
        ...newCompanies.map((c) => ({ import_id: importId, table_name: "companies", record_id: c.id, action: "created", previous: null })),
      ]);
    });
    const full = { ...stats, duplicate_names: dupes.slice(0, 50) };
    await sql`update imports set status = 'completed', stats = ${sql.json(full)}, completed_at = now() where id = ${importId}`;
    return { importId, stats: full };
  } catch (e) {
    await sql`update imports set status = 'failed', error = ${(e as Error).message}, completed_at = now() where id = ${importId}`;
    throw e;
  }
}
