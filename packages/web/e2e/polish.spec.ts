// Spec cemetery-polish, task 10.1: browser checks that jsdom cannot make. Spec clean-site, task 2.1: the tooltip case
// went with the tooltip (4.1).
// Every request to a host other than the local server is aborted, so nothing here reaches a network.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type Page } from "@playwright/test";
test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");
const DEMO = fileURLToPath(new URL("../public/demo/scan.json", import.meta.url));
const NARROW = { width: 360, height: 800 };
const GRAVE = 'button[data-grave-index][aria-label^="left-padder"]';
async function blockForeignOrigins(page: Page, origin: string): Promise<void> {
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });
}
function originOf(baseURL: string | undefined): string {
  return new URL(baseURL ?? "http://localhost:4173").origin;
}
const scrollWidth = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);
// Spec clean-site, task 11: the spec keeps a 14 px gutter around the Scene card on a phone, so
// the canvas is no longer full-bleed; it spans the content width inside that gutter.
test("at 360 px the page does not scroll sideways and the canvas spans the content width", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize(NARROW);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cemetery");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  const closed = await scrollWidth(page);
  const canvas = await page.locator("canvas.scene-canvas").first().boundingBox();
  expect(canvas?.x ?? 99).toBeLessThanOrEqual(16);
  // The canvas takes its width once the Scene card is measured, so its right edge is read until it has.
  const right = async (): Promise<number> => {
    const b = await page.locator("canvas.scene-canvas").first().boundingBox();
    return b === null ? 0 : b.x + b.width;
  };
  await expect.poll(right, { timeout: 2000 }).toBeGreaterThanOrEqual(NARROW.width - 16);
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.locator("#legend-panel")).toBeVisible();
  const legend = await scrollWidth(page);
  await page.getByRole("button", { name: "Legend" }).click();
  await page.locator(GRAVE).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const drawer = await scrollWidth(page);
  const box = await dialog.boundingBox();
  console.log(`scrollWidth at 360 px: drawer closed ${String(closed)}, drawer open ${String(drawer)}, legend open ${String(legend)}`);
  console.log(`drawer width at 360 px: ${String(box?.width)}`);
  expect(closed).toBeLessThanOrEqual(NARROW.width);
  expect(drawer).toBeLessThanOrEqual(NARROW.width);
  expect(legend).toBeLessThanOrEqual(NARROW.width);
  expect(box?.width).toBe(NARROW.width);
});
for (const width of [1280, 1440]) test(`a press on the Repository URL box closes the drawer and focuses the box at ${String(width)} px`, async ({ page, baseURL }) => {
  const origin = originOf(baseURL);
  const demo: unknown = JSON.parse(readFileSync(DEMO, "utf8"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/api/scan") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...(demo as object), actions: { remediate: true } }) });
    }
    return route.continue();
  });
  await page.setViewportSize({ width, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cemetery");
  const field = page.getByLabel("GitHub repository to scan");
  await field.fill("https://github.com/hsiddhu2/sexton-demo");
  await field.press("Enter");
  await page.locator(GRAVE).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await field.boundingBox();
  const drawerBox = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(drawerBox).not.toBeNull();
  if (box === null || drawerBox === null) return;
  // The field may run under the drawer, so press its visible part: inside the field, left of the drawer, on the backdrop.
  const x = box.x + 12;
  expect(x).toBeLessThan(drawerBox.x);
  await page.mouse.click(x, box.y + box.height / 2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(field).toBeFocused();
});
test("the pull request table of lodash is visible in the drawer", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cemetery");
  await page.locator('button[data-grave-index][aria-label^="lodash"]').first().click();
  // Spec clean-site, 7.16: the body is on the fix tab, in a closed disclosure.
  await page.getByRole("dialog").getByRole("tab", { name: "The fix" }).click();
  await page.getByRole("dialog").getByText("Read the pull request text").click();
  const table = page.getByRole("dialog").locator(".pr-preview table");
  await expect(table).toBeVisible();
  // Spec new-signals counts twelve signals, one row each (its design.md "Deliberate test changes"); this e2e still said
  // ten after main aff9623. Spec cemetery-undead-fixes, Deliberate test change 4.
  await expect(table.locator("tbody tr")).toHaveCount(12);
  await expect(table.locator("thead")).toBeVisible();
});
