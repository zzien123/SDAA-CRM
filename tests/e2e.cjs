// End-to-end workflow test. Run against a dev server pointed at a TEST database (it writes data):
//   DATABASE_URL=postgres://crm:crm@localhost:5432/crm_test npx next dev -p 3001
//   node tests/e2e.cjs http://localhost:3001
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const BASE = process.argv[2] || "http://localhost:3001";
const SHOTS = process.env.SHOTS_DIR;

let step = 0;
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`);
class Fail extends Error {}
const must = (cond, m) => { if (!cond) throw new Fail(m); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle" });
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
  const settle = () => page.waitForLoadState("networkidle");
  const visible = (sel) => page.locator(sel).first().isVisible();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const pick = async (input, text, option) => {
    await page.fill(input, text);
    await page.locator(`button:has-text("${option}")`).first().waitFor();
    await page.locator(`button:has-text("${option}")`).first().dispatchEvent("mousedown");
  };

  try {
    // ---- search
    await go("/");
    await page.fill('input[placeholder^="Search address"]', "901 S Tremont");
    await page.locator("button:has-text('901 S Tremont St')").first().waitFor();
    ok("universal search returns the property");
    await page.locator("button:has-text('901 S Tremont St')").first().dispatchEvent("mousedown");
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyUrl = page.url().replace(BASE, "");
    await settle();
    must(await visible("a:has-text('Werby LLC')"), "owner not shown on property");
    ok("property profile shows owner of record + portfolio link");

    // ---- log activity with follow-up
    await page.click("button:has-text('Call')");
    await page.fill('textarea[name="body"]', "Spoke with Richard. Loan matures mid-2027; would consider selling if price works. Wants a BOV.");
    await page.selectOption('select[name="outcome"]', "open_to_selling");
    await page.fill('input[name="follow_up_title"]', "Send BOV to Richard Werby");
    await page.fill('input[name="follow_up_date"]', today);
    await page.click("button:has-text('Log')");
    await page.locator("text=Spoke with Richard").first().waitFor();
    await settle();
    must(await visible("text=Send BOV to Richard Werby"), "follow-up task not created");
    ok("call logged with outcome; follow-up task created");

    // ---- entity: timeline roll-up, evidence rule, link person
    await page.locator("a:has-text('Werby LLC')").first().click();
    await page.waitForURL(/\/owners\//);
    await settle();
    must(await visible("text=Spoke with Richard"), "owner timeline missing property activity");
    must(await visible("td >> text=901 S Tremont St"), "portfolio missing property");
    ok("owner page rolls up portfolio and property activity");
    await page.click("text=+ Link a person");
    await page.fill('input[name="first_name"]', "Richard");
    await page.fill('input[name="last_name"]', "Werby");
    await page.selectOption('select[name="role"]', "beneficial_owner");
    await page.selectOption('form:has(input[name=first_name]) select[name="confidence"]', "unverified");
    await page.fill('form:has(input[name=first_name]) input[name="source"]', "Tax roll c/o line");
    await page.click("button[type=submit]:has-text('Link person')");
    await page.locator("text=Beneficial ownership needs evidence").waitFor();
    ok("unverified beneficial-owner claim is refused");
    await page.selectOption('select[name="role"]', "managing_member");
    await page.selectOption('select[name="is_decision_maker"]', "yes");
    await page.selectOption('form:has(input[name=first_name]) select[name="confidence"]', "public_record");
    await page.fill('form:has(input[name=first_name]) input[name="source"]', "CA SOS Statement of Information (test)");
    await page.click("button[type=submit]:has-text('Link person')");
    await page.locator("a:has-text('Richard Werby')").first().waitFor();
    ok("person linked as managing member / decision maker with source");
    await shot("e2e-owner");

    // ---- contact page shows relationships in reverse
    await page.locator("a:has-text('Richard Werby')").first().click();
    await page.waitForURL(/\/contacts\//);
    await settle();
    for (const t of ["Werby LLC", "901 S Tremont St"]) must(await visible(`text=${t}`), `contact page missing ${t}`);
    ok("contact → entity → property (bidirectional)");
    await page.fill('form:has(select[name=kind]) input[name="value"]', "760-603-0007");
    await page.click("form:has(select[name=kind]) button[type=submit]");
    await page.locator("a:has-text('(760) 603-0007')").waitFor();
    ok("phone added and normalized");

    // ---- buyer with criteria
    await go("/contacts/new?category=investor_buyer");
    await page.fill('input[name="first_name"]', "Test");
    await page.fill('input[name="last_name"]', "Buyer (sample)");
    await page.fill('input[name="company_name"]', "Sample Capital LLC");
    await page.fill('input[name="email"]', "buyer.sample@example.com");
    await page.click("button:has-text('Create contact')");
    await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);
    await settle();
    await page.fill('input[name="label"]', "10–30 units value-add");
    await page.fill('input[name="target_markets"]', "Oceanside, North Park");
    await page.fill('input[name="min_units"]', "10");
    await page.fill('input[name="max_units"]', "30");
    await page.fill('input[name="min_price"]', "3000000");
    await page.fill('input[name="max_price"]', "8000000");
    await page.selectOption('select[name="strategy"]', "value_add");
    await page.selectOption('select[name="is_1031"]', "yes");
    const rel = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    await page.fill('input[name="exchange_relinquished_close"]', rel);
    await page.click("button[type=submit]:has-text('Add criteria profile')");
    await page.locator("text=10–30 units value-add").first().waitFor();
    await settle();
    must(await visible("text=1031 · ID by"), "1031 deadline not computed");
    ok("buyer created with criteria; 45-day ID deadline computed");
    await go("/buyers?units=12&market=oceanside");
    must(await visible("a:has-text('Test Buyer (sample)')"), "buyer fit filter failed");
    await go("/buyers?units=50");
    must(!(await visible("a:has-text('Test Buyer (sample)')")), "buyer shown for 50 units");
    ok("buyer 'fits' filters respect known ranges");

    // ---- opportunity
    await go(propertyUrl);
    await page.click("a:has-text('Create opportunity')");
    await page.waitForURL(/opportunities\/new/);
    await settle();
    await page.fill('input[name="asking_price"]', "4200000");
    await page.fill('input[name="expected_price"]', "4000000");
    await page.selectOption('select[name="stage_id"]', { label: "Potential Seller" });
    await pick('input[placeholder="Decision maker…"]', "Richard", "Richard Werby");
    await pick('input[placeholder="Buyer…"]', "Test Buyer", "Test Buyer (sample)");
    await page.fill('input[name="next_action"]', "Deliver BOV");
    await page.fill('input[name="next_action_date"]', today);
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL(/\/opportunities\/[0-9a-f-]{36}$/);
    await settle();
    // $4.0M × 3% × 70% = $84,000
    must(await visible("text=est. commission $84,000"), "commission math wrong");
    ok("opportunity created from property; commission = $4.0M × 3% × 70% = $84,000");
    await page.locator("select").first().selectOption({ label: "Negotiating" });
    await page.locator("text=Stage → Negotiating").first().waitFor();
    ok("stage change logged to deal timeline");

    // ---- dashboard
    await go("/");
    must(await visible("text=Send BOV to Richard Werby"), "owner task not in action center");
    must(await visible("a:has-text('901 S Tremont St'):below(:text('3 · Active negotiations'))") || await visible("text=Negotiating ·"), "negotiation missing");
    must(await visible("text=$4.00M"), "pipeline gross missing");
    must(!(await visible("text=Owners who said they’re open to selling")), "open-to-sell should disappear once a deal exists");
    must(await visible("text=1031"), "1031 deadline missing from buyer follow-ups");
    ok("dashboard action center: owner task, negotiation, pipeline $, 1031 deadline");
    await shot("e2e-dashboard");
    await page.locator("li:has-text('Send BOV to Richard Werby') button[title='Mark done']").first().click();
    await page.locator("text=Send BOV to Richard Werby").first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    must(!(await visible("text=Send BOV to Richard Werby")), "task not completed");
    ok("task completed from dashboard");

    // ---- ownership change keeps history
    await go("/search?q=1023-25+12th");
    await page.locator("a:has-text('1023-25 12th St')").first().click();
    await page.waitForURL(/\/properties\//);
    await settle();
    await page.click("text=+ Record an ownership change");
    await page.fill('input[name="new_entity_name"]', "Sample Tremont Buyer LLC");
    await page.fill('form:has(input[name=new_entity_name]) input[name="start_date"]', today);
    await page.fill('form:has(input[name=new_entity_name]) input[name="source"]', "Test grant deed");
    await page.click("button:has-text('Record ownership change')");
    await page.locator("a:has-text('Sample Tremont Buyer LLC')").first().waitFor();
    await settle();
    must(await visible("text=Ownership history"), "history missing");
    ok("ownership change recorded; prior owner moved to history");

    // ---- contacts CSV import + dedupe + rollback
    const csv = path.join(os.tmpdir(), "contacts-sample.csv");
    fs.writeFileSync(csv, "Name,Email,Phone,Company\nTest Buyer (sample),buyer.sample@example.com,,Sample Capital LLC\nJane Sample,jane.sample@example.com,619-555-0101,Sample PM Co\n\"Sample, Alex\",alex.sample@example.com,858-555-0199,\n");
    await go("/data/import");
    await page.setInputFiles('input[type="file"]', csv);
    await page.locator("select").first().selectOption("contacts");
    await page.click("button:has-text('Preview')");
    await page.locator("text=Column mapping").waitFor();
    await page.click("button:has-text('Import 3 rows')");
    await page.locator("text=Import complete").waitFor();
    const txt = await page.textContent("main");
    must(/Contacts Created\s*2/i.test(txt) && /Contacts Matched\s*1/i.test(txt), "contact dedupe wrong: " + txt.slice(0, 300));
    ok("contacts CSV import: 2 created, 1 matched by email (no overwrite)");
    await go("/data");
    const row = page.locator("tr:has-text('contacts-sample.csv')").first(); // newest import is listed first
    await row.locator("button:has-text('Roll back')").click();
    await page.locator("button:has-text('Yes')").click();
    await row.locator("text=Rolled Back").waitFor();
    await go("/search?q=jane+sample");
    must(!(await visible("a:has-text('Jane Sample')")), "rollback left records");
    ok("import rolled back cleanly");

    // ---- property filters + export
    await go("/properties?min_units=10&min_tenure=20&contacted=never&sort=tenure");
    must(await visible("text=properties ·"), "list header missing");
    const res = await page.request.get(BASE + "/api/export/properties?min_units=100");
    must(res.ok() && (await res.text()).startsWith("street_address,"), "CSV export failed");
    ok("filtered list + CSV export");

    // ---- every nav page renders without errors
    for (const p of ["/", "/properties", "/owners", "/contacts", "/buyers", "/opportunities", "/tasks?view=week", "/data", "/settings", "/data/import"]) await go(p);
    must(!errors.length, "page errors: " + errors.join(" | "));
    ok("all pages render with no runtime or server errors");
    console.log(`\nE2E PASSED (${step} checks)`);
  } catch (e) {
    console.error(`\nE2E FAILED at step ${step + 1}: ${e.message}`);
    if (errors.length) console.error("page errors:", errors.join("\n"));
    await shot("e2e-failure");
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
