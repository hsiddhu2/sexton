// Spec judge-path: the Guide, the Fix-first line, the ring's Halo and the burial's speed in a real browser.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, expect, test, type Page } from "@playwright/test";
import { BUDGET_MS } from "./budget.js";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HookWindow {
  __sextonTiming?: {
    labels(): Rect[];
    paintVariant(variant: object): void;
    haloAlpha(x: number, y: number): number | null;
    redrawBurial(n: number, index: number): number[];
    guarded(): Rect[];
    ring(): Rect | null;
    uncutHalo(x: number, y: number): number;
  };
}

const AXE_PATH = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const FIX_FIRST = "Fix first: left-padder 1.2.1, Possessed, maintainer change in the last 90 days";

async function sameOriginOnly(page: Page, baseURL: string | undefined): Promise<void> {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return ((s[14] ?? 0) + (s[15] ?? 0)) / 2;
};

test.describe("first visit", () => {
  // A browser that has never closed the Guide.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`requirements 1.1, 1.13 to 1.16: at ${String(width)} by ${String(height)} every step sits by its Anchor, on screen and off every name`, async ({ page, baseURL }) => {
      await sameOriginOnly(page, baseURL);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
      const guide = page.locator("section.guide");
      await expect(guide).toBeVisible();
      await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
      for (let step = 1; step <= 4; step += 1) {
        await expect(guide).toContainText(`Step ${String(step)} of 4`);
        const anchor = step < 4 ? page.locator('button[data-grave-index="0"]') : page.locator(".night-footer .replay-button", { hasText: "axios, Mar 2026" });
        await expect(anchor).toBeInViewport();
        // The card follows its Anchor each frame: wait until it has settled, clear of every name.
        await expect
          .poll(() => page.evaluate(() => (document.querySelector("section.guide") as HTMLElement).dataset["side"]), { timeout: 3000 })
          .not.toBe("dock-forced");
        // The pointer rests on the card, so no grave under it shows its tooltip in the picture.
        const cardBox = await guide.boundingBox();
        if (cardBox !== null) await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 6);
        await page.waitForTimeout(100);
        const found = await page.evaluate(() => {
          const card = (document.querySelector("section.guide") as HTMLElement).getBoundingClientRect();
          const canvas = (document.querySelector("canvas") as HTMLCanvasElement).getBoundingClientRect();
          const labels = (window as unknown as HookWindow).__sextonTiming?.labels() ?? [];
          const over = labels.filter((l) => {
            const x = canvas.left + l.x;
            const y = canvas.top + l.y;
            return x < card.right && card.left < x + l.w && y < card.bottom && card.top < y + l.h;
          }).length;
          return { side: (document.querySelector("section.guide") as HTMLElement).dataset["side"], left: card.left, top: card.top, right: card.right, bottom: card.bottom, over, vw: window.innerWidth, vh: window.innerHeight };
        });
        console.log(`guide step ${String(step)} at ${String(width)}: ${String(found.side)}`);
        expect(found.side).not.toBe("dock-forced");
        expect(found.over).toBe(0);
        expect(found.left).toBeGreaterThanOrEqual(0);
        expect(found.top).toBeGreaterThanOrEqual(0);
        expect(found.right).toBeLessThanOrEqual(found.vw);
        expect(found.bottom).toBeLessThanOrEqual(found.vh);
        await page.screenshot({ path: `test-results/judge-${String(width)}-step${String(step)}.png` });
        await guide.getByRole("button", { name: step < 4 ? "Next" : "Done" }).click();
      }
      await expect(guide).toHaveCount(0);
      await page.mouse.move(1, 1);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(150);
      await page.screenshot({ path: `test-results/judge-${String(width)}-closed.png` });
      // Closed is remembered across a reload.
      await page.reload();
      await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
      await expect(page.getByRole("button", { name: "Guide" })).toBeVisible();
      await expect(guide).toHaveCount(0);
    });
  }

  test("requirements 7.6 and 7.7: axe finds no violation with the Guide open and with it closed", async ({ browser, baseURL }) => {
    // axe is injected as a script, which the page's policy rightly blocks: this one context sets the policy aside.
    const context = await browser.newContext({ bypassCSP: true, storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await sameOriginOnly(page, baseURL);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("section.guide")).toBeVisible();
    await page.addScriptTag({ path: AXE_PATH });
    const run = (): Promise<string[]> =>
      page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run(ctx: Document, o: object): Promise<{ violations: { id: string }[] }> } }).axe;
        // As the unit axe check: colour contrast is proved by the contrast tests, not read off a page mid-fade.
        const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
        return r.violations.map((v) => `${v.id}: ${(v as unknown as { nodes: { html: string }[] }).nodes.map((n) => n.html).join(" | ")}`);
      });
    expect(await run()).toEqual([]);
    await page.getByRole("button", { name: "Close guide" }).click();
    await expect(page.locator("section.guide")).toHaveCount(0);
    expect(await run()).toEqual([]);
    await context.close();
  });
});

test("requirements 1.10 to 1.12: the Guide works by keyboard alone, from the Guide button to Done", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  // The default storage state of this suite holds "closed": the Guide waits for its button.
  await expect(page.locator("section.guide")).toHaveCount(0);
  await page.getByRole("button", { name: "Guide" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#guide-title")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Next" })).toBeFocused();
  for (let step = 2; step <= 4; step += 1) {
    await page.keyboard.press("Enter");
    await expect(page.locator("section.guide")).toContainText(`Step ${String(step)} of 4`);
  }
  await expect(page.getByRole("button", { name: "Done" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("section.guide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guide" })).toBeFocused();
});

test("requirement 2.3: Fix first focuses left-padder's grave and shows its tooltip", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const button = page.getByRole("button", { name: FIX_FIRST });
  await expect(button).toBeVisible();
  await button.click();
  const grave = page.locator('button[data-grave-index="0"]');
  await expect(grave).toBeFocused();
  await expect(grave).toHaveAttribute("aria-label", /^left-padder 1\.2\.1/);
  await expect(page.locator(".grave-tooltip")).toBeVisible();
  await expect(page.locator(".grave-tooltip")).toContainText("maintainer change in the last 90 days");
});

test("requirement 4.7: after the axios Burst the Halo round the ring reads at least half the uncut Halo", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?replay=axios");
  const grave = page.locator("button[data-grave-index]").first();
  await expect(grave).toHaveCount(1);
  const slider = page.getByRole("slider", { name: "History date" });
  await slider.focus();
  await slider.press("ArrowRight");
  await slider.blur();
  await page.mouse.move(1, 899);
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.1, Possessed");
  await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
  const result = await page.evaluate(() => {
    const hook = (window as unknown as HookWindow).__sextonTiming;
    if (hook === undefined) return null;
    hook.paintVariant({});
    const ring = hook.ring();
    if (ring === null) return null;
    // Points 8 px inside and outside the ring, every 8 px along each side, away from every guarded box by more than
    // the cut's soft edge (design.md, decisions made during implementation, 1).
    const guarded = hook.guarded();
    const away = (x: number, y: number): boolean =>
      guarded.every((r) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h))) > 24);
    const points: [number, number][] = [];
    for (const d of [-8, 8]) {
      const x0 = ring.x - d;
      const y0 = ring.y - d;
      const x1 = ring.x + ring.w + d;
      const y1 = ring.y + ring.h + d;
      for (let x = x0; x <= x1; x += 8) points.push([x, y0], [x, y1]);
      for (let y = y0; y <= y1; y += 8) points.push([x0, y], [x1, y]);
    }
    const checked: { x: number; y: number; a: number; u: number }[] = [];
    for (const [x, y] of points) {
      if (!away(x, y)) continue;
      const u = hook.uncutHalo(x, y);
      if (u < 8) continue;
      checked.push({ x, y, a: hook.haloAlpha(x, y) ?? 0, u });
    }
    return checked;
  });
  expect(result).not.toBeNull();
  const checked = result ?? [];
  const worst = Math.min(...checked.map((p) => p.a / p.u));
  console.log(`requirement 4.7: ${String(checked.length)} points round the ring, worst share of the uncut Halo ${worst.toFixed(2)}`);
  expect(checked.length).toBeGreaterThan(20);
  for (const p of checked) expect(p.a, `${String(p.x)},${String(p.y)}`).toBeGreaterThanOrEqual(p.u / 2);
});

test("requirement 6.3: 300 front-row graves repaint inside 16 ms during a burial", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  const demo = (await (await page.request.get("/demo/scan.json")).json()) as { report: { packages: { name: string }[] }; timelines?: unknown };
  const possessed = demo.report.packages.find((p) => p.name === "left-padder");
  const dead = demo.report.packages.find((p) => p.name === "event-stream");
  const big = structuredClone(demo);
  big.report.packages = Array.from({ length: 300 }, (_, i) => ({ ...(structuredClone(i % 2 === 0 ? possessed : dead) as object), name: `pkg-${String(i)}` })) as typeof demo.report.packages;
  delete big.timelines;
  await page.route((url) => url.pathname === "/test/scan-burial.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(big) }));
  await page.goto("/?scan=/test/scan-burial.json");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(300);
  await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
  // The burial on a Dead grave in the front row, next to a Possessed one.
  const times = await page.evaluate(() => (window as unknown as HookWindow).__sextonTiming?.redrawBurial(30, 150) ?? []);
  expect(times).toHaveLength(30);
  const m = median(times);
  console.log(`median repaint of 300 front-row graves during a burial: ${m.toFixed(2)} ms`);
  expect(m).toBeLessThanOrEqual(BUDGET_MS);
});
