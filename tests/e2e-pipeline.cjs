// Kanban drag/drop + forecast + buyer-match outreach. Run against a TEST database server with at least one open deal.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.argv[2] || "http://localhost:3001";
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1800, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(BASE + "/opportunities", { waitUntil: "networkidle" });
    const card = page.locator("[draggable=true]").first();
    const name = (await card.locator("a").textContent()).trim();
    const target = (await page.locator("div.w-60 >> text=/^(Underwriting|Financials Requested)/").first().textContent()).trim().split(/\s\d/)[0];
    // Playwright's dragTo doesn't drive HTML5 drag events reliably; dispatch the same events a browser does
    await page.evaluate((stage) => {
      const card = document.querySelector("[draggable=true]");
      const col = [...document.querySelectorAll("div.w-60")].find((d) => d.querySelector("div")?.textContent.startsWith(stage));
      const dt = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      col.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      col.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, target);
    await page.waitForTimeout(1500);
    await page.goto(BASE + "/opportunities?view=list", { waitUntil: "networkidle" });
    const inUw = await page.locator(`div.rounded-lg:has(h2:text-matches("^${target}")) a:has-text("${name}")`).count();
    if (!inUw) throw new Error(`drag did not move deal to ${target}`);
    console.log(`  ✓ dragged "${name}" to ${target}; persisted`);
    await page.goto(BASE + "/opportunities?view=forecast", { waitUntil: "networkidle" });
    if (!(await page.locator("text=Commission by expected close month").isVisible())) throw new Error("forecast missing");
    console.log("  ✓ forecast renders");
    await page.goto(BASE + "/opportunities?view=list", { waitUntil: "networkidle" });
    const href = await page.locator(`a[href^="/opportunities/"]:has-text("${name}")`).first().getAttribute("href");
    await page.goto(BASE + href, { waitUntil: "networkidle" });
    const box = page.locator("li:has(input[type=checkbox]) input[type=checkbox]:not([disabled])").first();
    if (await box.count()) {
      await box.check();
      await page.click("button:has-text('Create outreach tasks (1)')");
      await page.locator("text=1 follow-up task created").waitFor({ timeout: 10000 });
      console.log("  ✓ buyer match → outreach task created");
    } else console.log("  - no matching buyers in test data; outreach step skipped");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("\nPIPELINE E2E PASSED");
  } catch (e) { console.error("PIPELINE E2E FAILED:", e.message); process.exitCode = 1; }
  await b.close();
})();
