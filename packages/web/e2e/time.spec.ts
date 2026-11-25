// Spec cemetery-time, task 2.7: browser checks that jsdom cannot make. Later tasks extend this file.
// Every request to a host other than the local server is aborted, so nothing here reaches a network.
import { existsSync } from "node:fs";
import { chromium, expect, test, type Page } from "@playwright/test";
test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");
async function blockForeignOrigins(page: Page, origin: string): Promise<void> {
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });
}
function originOf(baseURL: string | undefined): string {
  return new URL(baseURL ?? "http://localhost:4173").origin;
}
for (const width of [360, 768, 1280, 1920]) {
  test(`at ${String(width)} px the repository text and the demo label do not touch`, async ({ page, baseURL }) => {
    await blockForeignOrigins(page, originOf(baseURL));
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
    const text = await page.locator(".repo-text").first().boundingBox();
    const label = await page.locator(".demo-label").first().boundingBox();
    expect(text).not.toBeNull();
    expect(label).not.toBeNull();
    if (text === null || label === null) return;
    const sameLine = label.y < text.y + text.height && text.y < label.y + label.height;
    // Either on a later line, or at least 8 CSS pixels apart on the same line.
    if (sameLine) expect(label.x - (text.x + text.width)).toBeGreaterThanOrEqual(8);
    else expect(label.y).toBeGreaterThanOrEqual(text.y + text.height - 1);
  });
}
test("at 1440 by 900 the canvas reaches the bottom of the viewport", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  // Spec judge-path, Deliberate test change 10: the scene sizes itself after the fonts and the header settle, so the
  // canvas bottom is read until it has (it read 861.6 once in ten runs). The assertion is unchanged.
  const bottom = async (): Promise<number> => {
    const canvas = await page.locator("canvas").first().boundingBox();
    return canvas === null ? -1 : canvas.y + canvas.height;
  };
  await expect.poll(bottom, { timeout: 2000 }).toBeGreaterThanOrEqual(900);
});
// Task 5.8: the scrubber works by keyboard in a real browser and the graves repaint.
test("the scrubber moves by keyboard, shows as of, and Back to now returns to the scan date", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  const scrubber = page.getByRole("slider", { name: "History date" });
  await expect(scrubber).toBeVisible();
  const last = await scrubber.getAttribute("max");
  await expect(scrubber).toHaveValue(last ?? "");
  await expect(page.locator(".as-of")).toHaveCount(0);
  const before = await page.locator("canvas").first().evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await scrubber.focus();
  await scrubber.press("Home");
  await expect(scrubber).toHaveValue("0");
  await expect(page.locator(".as-of")).toContainText("as of");
  await expect(page.locator("button[data-grave-index][aria-label$=\"not yet published on this date\"]").first()).toBeVisible();
  // The canvas repaints in the next animation frame.
  await expect
    .poll(async () => page.locator("canvas").first().evaluate((c) => (c as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);
  await scrubber.press("End");
  await expect(scrubber).toHaveValue(last ?? "");
  await scrubber.press("Home");
  await page.getByRole("button", { name: "Back to now" }).click();
  await expect(scrubber).toHaveValue(last ?? "");
  await expect(scrubber).toBeFocused();
  await expect(page.locator(".as-of")).toHaveCount(0);
});

// Task 7.5: the two incident replays in a real browser. Written 23 Nov 2026, run by the orchestrator.
async function openReplay(page: Page, baseURL: string | undefined, search: string): Promise<{ readonly violations: string[]; readonly requests: string[] }> {
  const violations: string[] = [];
  const requests: string[] = [];
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) violations.push(msg.text());
  });
  page.on("request", (req) => {
    requests.push(req.url());
  });
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${search}`);
  await expect(page.locator("button[data-grave-index]")).toHaveCount(1);
  return { violations, requests };
}

const SOURCE_HREFS = {
  axios: [
    "https://www.trendmicro.com/en_us/research/26/c/axios-npm-package-compromised.html",
    "https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-002/",
    "https://docs.npmjs.com/trusted-publishers",
    "https://registry.npmjs.org/axios",
  ],
  keyv: [
    "https://snyk.io/blog/inside-keyv-npm-compromise-preinstall-malware-trusted-provenance-ide-hooks/",
    "https://osv.dev/vulnerability/MAL-2026-11524",
    "https://github.com/jaredwray/cacheable/issues/1692",
    "https://registry.npmjs.org/keyv",
  ],
} as const;

for (const id of ["axios", "keyv"] as const) {
  test(`?replay=${id} loads under the CSP with the banner and its links, and no external request`, async ({ page, baseURL }) => {
    const { violations, requests } = await openReplay(page, baseURL, `?replay=${id}`);
    const banner = page.locator('[role="note"]');
    await expect(banner).toHaveCount(1);
    await expect(banner).toContainText("Reconstructed from public reports. Not a live scan.");
    const links = banner.locator("a");
    await expect(links).toHaveCount(4);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual([...SOURCE_HREFS[id]]);
    expect(await links.evaluateAll((as) => as.every((a) => a.getAttribute("target") === "_blank" && a.getAttribute("rel") === "noopener noreferrer"))).toBe(true);
    await expect(page.locator(".demo-label")).toHaveCount(0);
    await expect(page.locator(".evidence-link")).toHaveCount(0);
    expect(requests.filter((u) => new URL(u).origin !== originOf(baseURL))).toEqual([]);
    expect(requests.some((u) => u.endsWith(`/replay/${id}.json`))).toBe(true);
    expect(violations).toEqual([]);
  });
}

test("the axios replay shows Alive 1.14.0, then Possessed 1.14.1, then Alive 1.14.0 again, with no Not-published mound", async ({ page, baseURL }) => {
  await openReplay(page, baseURL, "?replay=axios");
  const grave = page.locator("button[data-grave-index]").first();
  const scrubber = page.getByRole("slider", { name: "History date" });
  await expect(scrubber).toHaveValue("0");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await scrubber.focus();
  await scrubber.press("Home");
  await expect(scrubber).toHaveValue("0");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await expect(grave).not.toHaveAttribute("aria-label", /not yet published/);
  await scrubber.press("ArrowRight");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.1, Possessed");
  await grave.hover();
  await expect(page.getByRole("tooltip")).toContainText("provenance regression");
  await scrubber.press("ArrowRight");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
});

test("the keyv replay shows Alive 5.6.0, then Possessed 6.0.0 at its end, and a second replay opens from the header", async ({ page, baseURL }) => {
  await openReplay(page, baseURL, "?replay=keyv");
  const grave = page.locator("button[data-grave-index]").first();
  const scrubber = page.getByRole("slider", { name: "History date" });
  await expect(scrubber).toHaveValue("0");
  await expect(grave).toHaveAttribute("aria-label", "keyv 5.6.0, Alive");
  await scrubber.focus();
  await scrubber.press("Home");
  await expect(grave).toHaveAttribute("aria-label", "keyv 5.6.0, Alive");
  await expect(grave).not.toHaveAttribute("aria-label", /not yet published/);
  await scrubber.press("End");
  await grave.hover();
  await expect(page.getByRole("tooltip")).toContainText("install script added in 6.0.0");
  await page.getByRole("button", { name: "axios, Mar 2026" }).click();
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await expect(page.locator('[role="note"]')).toContainText("axios");
});

// Spec cemetery-time-fixes, task 3.6: Play steps one Stop every 1,500 ms (requirements 3.1, 4.2, 4.4).
test("Play on the axios replay reaches the Possessed Stop after 1,500 ms and the last Stop after 3,000 ms", async ({ page, baseURL }) => {
  await page.clock.install();
  await openReplay(page, baseURL, "?replay=axios");
  const grave = page.locator("button[data-grave-index]").first();
  const scrubber = page.getByRole("slider", { name: "History date" });
  await expect(scrubber).toHaveValue("0");
  const play = page.getByRole("button", { name: "Play" });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.clock.runFor(1500);
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.1, Possessed");
  await page.clock.runFor(1500);
  await expect(scrubber).toHaveValue("2");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

// Spec cemetery-time-fixes, task 5.4: a compact header (requirements 7.1, 7.2, 7.3).
// Spec cemetery-undead, Deliberate test change 26: one header row, and the Footer bar at the bottom of the viewport.
test("at 1440 by 900 on the demo the canvas top is at most 190, with the header on one row and the footer bar in view", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  // Spec judge-path, Deliberate test change 12: the page is measured once its web fonts have loaded and the scene has
  // fitted itself again. Before that the header's fallback text wraps wider (194 px against 155 px), which pushed the
  // front row under the Footer bar on the CI runner. The assertions are unchanged.
  await page.evaluate(() => document.fonts.ready.then(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  await expect.poll(() => page.evaluate(() => document.querySelector("header")?.getBoundingClientRect().height ?? 0)).toBeLessThanOrEqual(190);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const box = async (selector: string) => {
    const b = await page.locator(selector).first().boundingBox();
    expect(b, selector).not.toBeNull();
    return b ?? { x: 0, y: 0, width: 0, height: 0 };
  };
  const header = await box("header.site-header");
  const footer = await box("footer.night-footer");
  const canvas = await box("canvas");
  console.log(`header height ${String(header.height)}, footer height ${String(footer.height)}, canvas top ${String(canvas.y)}`);
  expect(canvas.y).toBeLessThanOrEqual(190);
  expect(Math.round(footer.y + footer.height)).toBe(900);
  const middle = (b: { y: number; height: number }) => b.y + b.height / 2;
  const controls = await Promise.all([".repo-form", ".sound-toggle", ".serious-toggle", ".legend-toggle"].map(box));
  for (const c of controls) expect(Math.abs(middle(c) - middle(controls[0] ?? c))).toBeLessThan(12);
  const parts = await Promise.all(["button.scrub-play", "label[for=history-date]", ".scrub-date", "#history-date"].map(box));
  for (const p of parts) expect(Math.abs(middle(p) - middle(parts[0] ?? p))).toBeLessThan(12);
  // Every grave of the demo fits between the header and the footer.
  for (const g of await page.locator("button[data-grave-index]").all()) {
    const b = await g.boundingBox();
    expect(b).not.toBeNull();
    if (b !== null) expect(b.y + b.height).toBeLessThanOrEqual(footer.y + 1);
  }
});

for (const search of ["", "?replay=axios"]) {
  test(`at 390 px there is no horizontal scroll on ${search === "" ? "the demo" : "the axios replay"}`, async ({ page, baseURL }) => {
    await blockForeignOrigins(page, originOf(baseURL));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${search}`);
    await expect(page.locator("button[data-grave-index]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
  test(`at 360 px there is no horizontal scroll on ${search === "" ? "the demo" : "the axios replay"}`, async ({ page, baseURL }) => {
    await blockForeignOrigins(page, originOf(baseURL));
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${search}`);
    await expect(page.locator("button[data-grave-index]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  });
}
