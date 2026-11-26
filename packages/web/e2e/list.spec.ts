// Spec clean-site, task 4.2: the List of 300 packages in a real browser (requirements 6.11 and 6.12). Each key pressed
// in "Find a package" shows the new rows within 100 ms, measured in the page from the key's keydown to the last change
// of the table body that the key caused, taken at the next frame.
import { existsSync } from "node:fs";
import { chromium, expect, test } from "@playwright/test";
import { scan300, SCAN_300_COUNT, SCAN_300_PATH } from "./scan-300.js";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");

/** Requirement 6.12: the new rows show within this many ms of a key press on the e2e machine. */
const KEY_BUDGET_MS = 100;
const QUERY = "left-pad-1";

interface TimingWindow {
  __listKeys?: { start: number; last: number }[];
}

test("requirement 6.11 and 6.12: a 300-package List shows each package once and follows each Find key within 100 ms", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });
  const demo = (await (await page.request.get("/demo/scan.json")).json()) as Parameters<typeof scan300>[0];
  const big = scan300(demo);
  await page.route((url) => url.pathname === SCAN_300_PATH, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(big) }));
  await page.goto(`/?scan=${SCAN_300_PATH}`);
  await expect(page.locator("button.grave-button")).toHaveCount(SCAN_300_COUNT);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const rows = page.locator("table.list-table tbody .list-open");
  await expect(rows).toHaveCount(SCAN_300_COUNT);
  const shown = await rows.allTextContents();
  expect(new Set(shown).size).toBe(SCAN_300_COUNT);

  // Every keydown starts a sample; every change of the table body after it moves the sample's end.
  await page.evaluate(() => {
    const w = window as unknown as TimingWindow;
    const samples: { start: number; last: number }[] = [];
    w.__listKeys = samples;
    document.addEventListener(
      "keydown",
      () => {
        const now = performance.now();
        samples.push({ start: now, last: now });
      },
      true,
    );
    const body = document.querySelector("table.list-table tbody");
    if (body === null) throw new Error("no list body");
    new MutationObserver(() => {
      // The sample ends at the frame after the change, so the time counts the paint of the new rows too.
      const sample = samples[samples.length - 1];
      if (sample !== undefined)
        requestAnimationFrame(() => {
          sample.last = performance.now();
        });
    }).observe(body, { childList: true, subtree: true, characterData: true });
  });
  const find = page.getByRole("searchbox", { name: "Find a package" });
  await find.focus();
  for (let i = 0; i < QUERY.length; i += 1) {
    await page.keyboard.press(QUERY.charAt(i));
    const expected = big.report.packages.filter((p) => p.name.toLowerCase().includes(QUERY.slice(0, i + 1))).length;
    await expect(page.locator("table.list-table tbody tr")).toHaveCount(Math.max(expected, 1));
    // Two frames, so the frame that ends this key's sample has run before the next key.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  const samples = await page.evaluate(() => (window as unknown as TimingWindow).__listKeys ?? []);
  expect(samples).toHaveLength(QUERY.length);
  const times = samples.map((s) => s.last - s.start);
  console.log(`List of ${String(SCAN_300_COUNT)}: ms from each Find key to its new rows: ${times.map((t) => t.toFixed(1)).join(", ")}`);
  for (const t of times) expect(t).toBeLessThanOrEqual(KEY_BUDGET_MS);
});
