// Spec judge-path: the ring's Halo and the burial's speed in a real browser. Spec clean-site, task 2: the Guide and
// Fix-first cases went with those features (4.1).
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
    paintVariant(variant: object): void;
    haloAlpha(x: number, y: number): number | null;
    redrawBurial(n: number, index: number): number[];
    guarded(): Rect[];
    ring(): Rect | null;
    uncutHalo(x: number, y: number): number;
  };
}

const AXE_PATH = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

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

// The general half of judge-path 7.6 and 7.7, kept when the Guide case went: axe in a real browser on the demo.
test("requirement 7.7: axe finds no violation on the demo", async ({ browser, baseURL }) => {
  // axe is injected as a script, which the page's policy rightly blocks: this one context sets the policy aside.
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await sameOriginOnly(page, baseURL);
  await page.goto("/");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(ctx: Document, o: object): Promise<{ violations: { id: string }[] }> } }).axe;
    // As the unit axe check: colour contrast is proved by the contrast tests.
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${(v as unknown as { nodes: { html: string }[] }).nodes.map((n) => n.html).join(" | ")}`);
  });
  expect(violations).toEqual([]);
  await context.close();
});

test("requirement 4.7: after the axios Burst the Halo round the ring reads at least half the uncut Halo", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?replay=axios");
  const grave = page.locator("button[data-grave-index]").first();
  await expect(grave).toHaveCount(1);
  // Spec clean-site, task 6.3: a Replay moves by "Next step"; it has no scrubber.
  await page.getByRole("button", { name: "Next step" }).click();
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
  console.log(`median repaint of 300 front-row graves during a burial: ${m.toFixed(2)} ms (budget ${String(BUDGET_MS)} ms)`);
  expect(m).toBeLessThanOrEqual(BUDGET_MS);
});
