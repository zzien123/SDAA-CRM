// Previous/Next through the list you came from.  node tests/e2e-nav.cjs http://localhost:3001
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.argv[2] || "http://localhost:3001";
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const must = (c, m) => { if (!c) throw new Error(m); };
  const title = async () => (await page.locator("main h1").first().textContent()).trim();
  try {
    await page.goto(BASE + "/properties?city=Oceanside&min_units=20&sort=units", { waitUntil: "networkidle" });
    const rows = (await page.locator("tbody tr td:first-child a").allTextContents()).map((t) => t.trim());
    must(rows.length >= 4, "need 4+ rows");
    await page.locator("tbody tr td:first-child a").nth(1).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}\?from=/);
    await page.waitForLoadState("networkidle");
    must((await title()) === rows[1], `opened ${await title()}, expected ${rows[1]}`);
    must(await page.locator("text=/Filtered list · 2 of/").isVisible(), "position not shown");
    console.log(`  ✓ opened row 2 (${rows[1]}), shows "2 of N"`);
    const t0 = Date.now();
    await page.click("a:has-text('Next')");
    await page.waitForFunction((x) => document.querySelector("main h1")?.textContent.trim() === x, rows[2]);
    console.log(`  ✓ Next → ${rows[2]} (${Date.now() - t0} ms)`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    if (process.env.DEBUG) { page.on("console", (m) => console.log("   console:", m.text().slice(0, 120))); await page.evaluate(() => window.addEventListener("keydown", (e) => console.log("keydown", e.key, (e.target).tagName, location.pathname))); }
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction((x) => document.querySelector("main h1")?.textContent.trim() === x, rows[3]);
    console.log(`  ✓ → key → ${rows[3]}`);
    await page.click("a:has-text('Previous')");
    await page.waitForFunction((x) => document.querySelector("main h1")?.textContent.trim() === x, rows[2]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500); // let the new page's key handler attach
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction((x) => document.querySelector("main h1")?.textContent.trim() === x, rows[1]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500); // let the new page's key handler attach
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction((x) => document.querySelector("main h1")?.textContent.trim() === x, rows[0]);
    must(!(await page.locator("a:has-text('Previous')").count()), "Previous should be disabled on first row");
    console.log("  ✓ Previous / ← back to row 1; Previous disabled at the start");
    await page.locator('textarea[name="body"]').fill("typing");
    await page.locator('textarea[name="body"]').press("ArrowRight");
    await page.waitForTimeout(800);
    must((await title()) === rows[0], "arrow key navigated while typing");
    console.log("  ✓ arrow keys ignored while typing in a field");
    await page.click("a:has-text('Filtered list')");
    await page.waitForURL(/\/properties\?/);
    must(page.url().includes("city=Oceanside"), "back-to-list lost filters");
    console.log("  ✓ 'Filtered list' returns to the same filters");
    console.log("\nNAV E2E PASSED");
  } catch (e) {
    console.error("NAV E2E FAILED:", e.message, "| at:", await title().catch(() => "?"), page.url());
    await page.screenshot({ path: (process.env.SHOTS_DIR || "/tmp") + "/nav-fail.png" });
    process.exitCode = 1;
  }
  await b.close();
})();
