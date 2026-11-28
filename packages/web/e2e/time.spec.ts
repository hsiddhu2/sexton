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
// Spec clean-site, task 11: the demo label and the repository text went with the old header (task 3). The same
// check now covers the one-row header at its breakpoints: nothing in it overlaps, the scan tag shows only from 1300 px,
// and from 700 px the header is one row of at most 64 px (1.2, 1.4, 15.1).
for (const width of [360, 768, 1280, 1920]) {
  test(`at ${String(width)} px the header's parts do not touch`, async ({ page, baseURL }) => {
    await blockForeignOrigins(page, originOf(baseURL));
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/cemetery");
    await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
    await page.evaluate(() => document.fonts.ready);
    const parts = [".wordmark", ".scan-form", ".ib-guide", ".legend-toggle", "[data-tour-button]"];
    if (width >= 1300) parts.push(".scan-tag");
    else await expect(page.locator(".scan-tag")).toBeHidden();
    const boxes = await Promise.all(parts.map(async (selector) => ({ selector, box: await page.locator(selector).first().boundingBox() })));
    for (const { selector, box } of boxes) expect(box, selector).not.toBeNull();
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]?.box;
        const b = boxes[j]?.box;
        if (!a || !b) continue;
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart, `${boxes[i]?.selector ?? ""} and ${boxes[j]?.selector ?? ""}`).toBe(true);
      }
    }
    const header = await page.locator("header.site-header").boundingBox();
    if (width >= 700) expect(header?.height ?? 999).toBeLessThanOrEqual(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
// Spec clean-site, task 11: the Scene is a card above the Footer bar, as the spec sets, so the
// ground reaches the bottom of the Scene card (not of the viewport) and the Footer bar ends inside the viewport.
test("at 1440 by 900 the canvas reaches the bottom of the Scene card, above the Footer bar", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cemetery");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  // The scene sizes itself after the fonts and the header settle, so the gap is read until it has.
  const gap = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas.scene-canvas")?.getBoundingClientRect();
      const card = document.querySelector(".scene-card")?.getBoundingClientRect();
      return canvas === undefined || card === undefined ? 99 : Math.abs(card.bottom - canvas.bottom);
    });
  await expect.poll(gap, { timeout: 2000 }).toBeLessThanOrEqual(2);
  const bottom = async (): Promise<number> => {
    const footer = await page.locator("footer.foot-bar").boundingBox();
    return footer === null ? 999 : footer.y + footer.height;
  };
  await expect.poll(bottom, { timeout: 2000 }).toBeLessThanOrEqual(900);
  expect(await gap()).toBeLessThanOrEqual(2);
});
// Task 5.8: the scrubber works by keyboard in a real browser and the graves repaint.
test("the scrubber moves by keyboard, shows as of, and Back to now returns to the scan date", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cemetery");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  const scrubber = page.getByRole("slider", { name: "History date" });
  await expect(scrubber).toBeVisible();
  const last = await scrubber.getAttribute("max");
  await expect(scrubber).toHaveValue(last ?? "");
  await expect(page.locator(".date-badge")).toHaveCount(0);
  const before = await page.locator("canvas.scene-canvas").first().evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await scrubber.focus();
  await scrubber.press("Home");
  await expect(scrubber).toHaveValue("0");
  await expect(page.locator(".date-badge")).toContainText("Viewing");
  await expect(page.locator("button[data-grave-index][aria-label$=\"not yet published on this date\"]").first()).toBeVisible();
  // The canvas repaints in the next animation frame.
  await expect
    .poll(async () => page.locator("canvas.scene-canvas").first().evaluate((c) => (c as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);
  await scrubber.press("End");
  await expect(scrubber).toHaveValue(last ?? "");
  await scrubber.press("Home");
  await page.getByRole("button", { name: "Back to now" }).click();
  await expect(scrubber).toHaveValue(last ?? "");
  await expect(scrubber).toBeFocused();
  await expect(page.locator(".date-badge")).toHaveCount(0);
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
  await page.goto(`/cemetery${search}`);
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
  // Spec clean-site, task 6.3: the banner is the Why card in the Panel (8.12).
  test(`?replay=${id} loads under the CSP with the Why card and its links, and no external request`, async ({ page, baseURL }) => {
    const { violations, requests } = await openReplay(page, baseURL, `?replay=${id}`);
    const banner = page.locator(".why-card");
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

// Spec clean-site, task 6.3: the Replay moves by Next step and its Step cards; its grave opens nothing (8.19), so
// the reason is read from "What Sexton shows".
test("the axios replay shows Alive 1.14.0, then Possessed 1.14.1, then Alive 1.14.0 again, with no Not-published mound", async ({ page, baseURL }) => {
  await openReplay(page, baseURL, "?replay=axios");
  const grave = page.locator("button[data-grave-index]").first();
  await expect(page.locator(".step-panel h2")).toContainText("Step 1 of 3");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await expect(grave).not.toHaveAttribute("aria-label", /not yet published/);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.1, Possessed");
  await expect(page.locator(".step-panel")).toContainText("1.14.1 has none");
  await grave.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await expect(page.getByRole("button", { name: "Back to the cemetery" })).toBeVisible();
});

test("the keyv replay shows Alive 5.6.0, then Possessed 6.0.0 at its end, and a second replay opens after Exit replay", async ({ page, baseURL }) => {
  await openReplay(page, baseURL, "?replay=keyv");
  const grave = page.locator("button[data-grave-index]").first();
  await expect(grave).toHaveAttribute("aria-label", "keyv 5.6.0, Alive");
  await expect(grave).not.toHaveAttribute("aria-label", /not yet published/);
  await page.locator("footer .step-card").nth(1).click();
  await expect(grave).toHaveAttribute("aria-label", "keyv 6.0.0, Possessed");
  await expect(page.locator(".step-panel")).toContainText("An install script appeared");
  await page.getByRole("button", { name: "Exit replay" }).click();
  await page.getByRole("button", { name: "Watch a real attack" }).click();
  await page.getByRole("button", { name: /^axios/ }).click();
  await expect(page.locator("button[data-grave-index]").first()).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await expect(page.locator(".why-card")).toContainText("axios");
});

// Spec cemetery-time-fixes, task 3.6; spec clean-site, 8.9: Play all steps one Step every 5,000 ms.
test("Play all on the axios replay reaches the Possessed Step after 5,000 ms and the last Step after 10,000 ms", async ({ page, baseURL }) => {
  await page.clock.install();
  await openReplay(page, baseURL, "?replay=axios");
  const grave = page.locator("button[data-grave-index]").first();
  const play = page.getByRole("button", { name: "Play all" });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.clock.runFor(5000);
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.1, Possessed");
  await page.clock.runFor(5000);
  await expect(page.locator('footer .step-card[aria-current="step"]')).toContainText("Step 3");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  await expect(page.getByRole("button", { name: "Play all" })).toBeVisible();
});

// Spec cemetery-time-fixes, task 5.4, rewritten for spec clean-site, task 11: at 1440 by 900 Home fits the viewport
// as the spec sets: the one-row header, the Welcome bar, the headline and chips, the Scene with
// every grave, the Footer bar and the Panel. The graves shrink together to fit (the fit scale), never overlapping.
test("at 1440 by 900 on the demo Home fits the viewport, with every grave above the Footer bar", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cemetery");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  const box = async (selector: string) => {
    const b = await page.locator(selector).first().boundingBox();
    expect(b, selector).not.toBeNull();
    return b ?? { x: 0, y: 0, width: 0, height: 0 };
  };
  await expect.poll(async () => (await box("header.site-header")).height).toBeLessThanOrEqual(64);
  const welcome = await box(".welcome");
  expect(welcome.y).toBeLessThan(120);
  const canvas = await box("canvas.scene-canvas");
  const footer = await box("footer.foot-bar");
  const panel = await box("aside.panel");
  console.log(`canvas top ${String(canvas.y)}, canvas height ${String(canvas.height)}, footer bottom ${String(footer.y + footer.height)}`);
  expect(canvas.y).toBeLessThanOrEqual(260);
  expect(footer.y + footer.height).toBeLessThanOrEqual(900);
  expect(panel.y + panel.height).toBeLessThanOrEqual(900);
  const graves = await page.locator("button[data-grave-index]").all();
  const rects = [];
  for (const g of graves) {
    const b = await g.boundingBox();
    expect(b).not.toBeNull();
    if (b === null) continue;
    expect(b.y).toBeGreaterThanOrEqual(canvas.y);
    expect(b.y + b.height).toBeLessThanOrEqual(footer.y + 1);
    rects.push(b);
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (!a || !b) continue;
      const apart = a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5;
      expect(apart).toBe(true);
    }
  }
});

// Spec clean-site, task 11 (15.2, 15.3): at 390 by 844 the page is one column, the Scene, then the Footer bar, then the
// Panel, and the front Tier stands first from the top, two graves to a row.
test("at 390 by 844 the worst graves come first, two to a row, then the Footer bar and the Panel", async ({ page, baseURL }) => {
  await blockForeignOrigins(page, originOf(baseURL));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cemetery");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  await page.evaluate(() => document.fonts.ready);
  const header = await page.locator("header.site-header").boundingBox();
  const field = await page.locator(".scan-form").boundingBox();
  const mark = await page.locator(".wordmark").boundingBox();
  expect(field && mark && field.y >= mark.y + mark.height).toBe(true);
  expect(header?.height ?? 999).toBeLessThanOrEqual(120);
  const first = await page.locator('button[data-grave-index="0"]').boundingBox();
  const second = await page.locator('button[data-grave-index="1"]').boundingBox();
  const last = await page.locator('button[data-grave-index="11"]').boundingBox();
  expect(first && second && last).toBeTruthy();
  if (!first || !second || !last) return;
  expect(second.y).toBe(first.y);
  expect(second.x).toBeGreaterThan(first.x);
  expect(last.y).toBeGreaterThan(first.y);
  const canvas = await page.locator("canvas.scene-canvas").first().boundingBox();
  const footer = await page.locator("footer.foot-bar").boundingBox();
  const panel = await page.locator("aside.panel").boundingBox();
  expect(canvas && footer && panel).toBeTruthy();
  if (!canvas || !footer || !panel) return;
  expect(footer.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
  expect(panel.y).toBeGreaterThanOrEqual(footer.y + footer.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

for (const search of ["", "?replay=axios"]) {
  test(`at 390 px there is no horizontal scroll on ${search === "" ? "the demo" : "the axios replay"}`, async ({ page, baseURL }) => {
    await blockForeignOrigins(page, originOf(baseURL));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/cemetery${search}`);
    await expect(page.locator("button[data-grave-index]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
  test(`at 360 px there is no horizontal scroll on ${search === "" ? "the demo" : "the axios replay"}`, async ({ page, baseURL }) => {
    await blockForeignOrigins(page, originOf(baseURL));
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/cemetery${search}`);
    await expect(page.locator("button[data-grave-index]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  });
}
