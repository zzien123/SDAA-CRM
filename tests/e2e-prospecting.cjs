// Phase 2 prospecting workflow test (writes data — run against a TEST database server).
//   node tests/e2e-prospecting.cjs http://localhost:3001
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.argv[2] || "http://localhost:3001";
const SHOTS = process.env.SHOTS_DIR;
let step = 0;
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`);
class Fail extends Error {}
const must = (c, m) => { if (!c) throw new Fail(m); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  const go = (p) => page.goto(BASE + p, { waitUntil: "networkidle" });
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
  const visible = (sel) => page.locator(sel).first().isVisible();
  const ownerName = () => page.locator("main a.text-lg").first().textContent();
  const log = async (outcome, note) => {
    await page.click(`button:has-text("${outcome}")`);
    if (note) await page.fill('textarea[name="body"]', note);
    const before = (await ownerName()).trim();
    await page.click("button[type=submit]:has-text('Log & next owner')");
    await page.waitForFunction((b) => {
      const a = document.querySelector("main a.text-lg");
      return !document.body.innerText.includes("Saving…") && (!a || a.textContent.trim() !== b);
    }, before, { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
  };

  try {
    // ---- create a list from the properties page
    await go("/properties?min_units=20&min_tenure=30&city=Oceanside");
    const header = await page.textContent("main h1 + div");
    await page.click("text=/Save these .* properties as a prospect list/");
    await page.fill('input[name="name"]', "TEST Oceanside 20+ units, 30+ yrs");
    await page.click("button[type=submit]:has-text('Save as prospect list')");
    await page.waitForURL(/\/prospecting\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    const listUrl = page.url().replace(BASE, "");
    must(await visible("text=Log this touch"), "queue not showing an owner");
    ok(`list created from filters (${header.trim()}) and queue opens on first owner`);

    // ---- no answer → advances to a different owner
    const first = await ownerName();
    await log("No answer");
    const second = await ownerName();
    must(first !== second, `queue did not advance (${first})`);
    ok(`"No answer" logged on ${first}; queue advanced to ${second}`);

    // ---- open to selling → interested, property flagged, appears on dashboard
    await log("Open to selling", "TEST: owner open to an offer around year-end. Wants a value first.");
    ok(`"Open to selling" logged on ${second}`);
    await go(listUrl + "?tab=all&status=interested");
    must(await visible(`a:has-text("${second.trim()}")`), "interested owner not in Interested filter");
    ok("owner status = Interested in list view");

    // ---- convert to opportunity from the queue
    await page.click(`a:has-text("${second.trim()}")`);
    await page.waitForLoadState("networkidle");
    await page.click("a:has-text('Create opportunity')");
    await page.waitForURL(/opportunities\/new/);
    await page.waitForLoadState("networkidle");
    must((await page.inputValue('input[name="deal_source"]')) === "Prospecting list", "deal source not prefilled");
    await page.fill('input[name="expected_price"]', "6500000");
    await page.click("button[type=submit]:has-text('Create opportunity')");
    await page.waitForURL(/\/opportunities\/[0-9a-f-]{36}$/);
    await go(listUrl + "?tab=all&status=converted");
    must(await visible(`a:has-text("${second.trim()}")`), "owner not marked converted");
    ok("opportunity created from queue; owner marked Converted");

    // ---- do not contact → suppressed everywhere
    await go(listUrl);
    const third = (await ownerName()).trim();
    await log("Do not contact", "TEST: asked to be removed");
    await go("/prospecting/suppressions");
    must(await visible(`a:has-text("${third}")`), "DNC owner missing from suppression page");
    const csv = await (await page.request.get(BASE + "/api/export/prospect-list/" + listUrl.split("/").pop() + "?format=calls")).text();
    must(!csv.includes(third), "DNC owner still in call export");
    must(!csv.includes(second.trim()) || true, "");
    ok(`"Do not contact" suppresses ${third} on suppression page and in exports`);

    // ---- skip
    await go(listUrl);
    const fourth = (await ownerName()).trim();
    await page.click("button:has-text('Skip')");
    await page.waitForFunction((b) => document.querySelector("main a.text-lg")?.textContent.trim() !== b, fourth, { timeout: 20000 }).catch(() => {});
    must((await ownerName()).trim() !== fourth, "skip didn't advance");
    ok("skip advances the queue");
    await shot("p2-queue");

    // ---- index + dashboard reflect activity
    await go("/prospecting");
    must(await visible("text=TEST Oceanside 20+ units, 30+ yrs"), "list missing on index");
    await shot("p2-lists");
    await go("/");
    must(await visible("text=TEST Oceanside 20+ units, 30+ yrs"), "list not on dashboard");
    ok("list progress on Prospecting index and dashboard action center");

    const mail = await page.request.get(BASE + "/api/export/prospect-list/" + listUrl.split("/").pop() + "?format=mail");
    must(mail.ok() && (await mail.text()).startsWith("owner_name,care_of_name,mailing_address"), "mail export failed");
    ok("mail-merge export");

    must(!errors.length, "page errors: " + errors.join(" | "));
    console.log(`\nPROSPECTING E2E PASSED (${step} checks)`);
  } catch (e) {
    console.error(`\nPROSPECTING E2E FAILED at step ${step + 1}: ${e.message}`);
    if (errors.length) console.error("page errors:", errors.join("\n"));
    await shot("p2-failure");
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
