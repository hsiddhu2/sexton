// Spec cemetery-undead-fixes: browser checks of bugs 1 and 2.
import { existsSync } from "node:fs";
import { chromium, expect, test, type Page } from "@playwright/test";
import { BUDGET_MS } from "./budget.js";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");

interface HookWindow {
  __sextonTiming?: {
    paintVariant(variant: { sprites?: boolean; nowMs?: number }): void;
    haloAlpha(x: number, y: number): number | null;
    redrawHalo(n: number): number[];
    redrawHaloCold(n: number): number[];
  };
}

async function sameOriginOnly(page: Page, baseURL: string | undefined): Promise<void> {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });
}

test("bug 1: the Halo is not cut in the empty corners of the selected replay grave's cell", async ({ page, baseURL }) => {
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
  await expect(page.locator(".burst-caption")).toBeVisible();
  await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
  const box = await grave.boundingBox();
  expect(box).not.toBeNull();
  const alphas = await page.evaluate((b) => {
    const hook = (window as unknown as HookWindow).__sextonTiming;
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    hook?.paintVariant({});
    // The cell's two top corners, 45 px in: no stone, Character, Ghost, ring or name there.
    const x0 = b.x - r.left;
    const y0 = b.y - r.top;
    return [hook?.haloAlpha(x0 + 45, y0 + 45) ?? -1, hook?.haloAlpha(x0 + b.width - 45, y0 + 45) ?? -1];
  }, box ?? { x: 0, y: 0, width: 0, height: 0 });
  console.log(`bug 1: Halo alpha at the replay cell's top corners: ${alphas.join(", ")}`);
  for (const a of alphas) expect(a).toBeGreaterThan(0);
});

test("bug 2: across a Pose boundary the sprite comparison differs far more than at one instant", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.clock.install({ time: new Date("2026-11-24T12:00:00Z") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
  await page.clock.runFor(1_500);
  await page.clock.pauseAt(new Date("2026-11-24T12:00:05Z"));
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const shares = await page.evaluate(() => {
    const hook = (window as unknown as HookWindow).__sextonTiming;
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const share = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
      let far = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.max(Math.abs((a[i] ?? 0) - (b[i] ?? 0)), Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)), Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0))) > 48) far += 1;
      }
      return far / (a.length / 4);
    };
    // A Pose lasts 1000 / 12 ms; t sits just before a boundary, t + 84 just after it.
    const t = Math.floor(Date.now() / (1000 / 12)) * (1000 / 12) + 40;
    const frame = (sprites: boolean, nowMs: number): Uint8ClampedArray => {
      hook?.paintVariant({ sprites, nowMs });
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const same = share(frame(true, t), frame(false, t));
    const across = share(frame(true, t), frame(false, t + 84));
    return { same, across };
  });
  console.log(`bug 2: differing share at one instant ${(100 * shares.same).toFixed(3)}%, across a Pose boundary ${(100 * shares.across).toFixed(3)}%`);
  expect(shares.same).toBeLessThan(0.001);
  expect(shares.across).toBeGreaterThanOrEqual(10 * Math.max(shares.same, 0.0001));
});

for (const [label, mix] of [
  ["the smoke test's 300 graves with left-padder first", "one"],
  ["300 front-row graves, Possessed and Dead in turn", "front"],
] as const) {
  test(`requirement 2.9: a Halo layer repaint with ${label} stays inside 16 ms`, async ({ page, baseURL }) => {
    await sameOriginOnly(page, baseURL);
    const demo = (await (await page.request.get("/demo/scan.json")).json()) as {
      report: { packages: { name: string; signals: { advisories: { available: boolean; value: unknown[] } } }[] };
      timelines?: unknown;
    };
    const possessed = demo.report.packages.find((p) => p.name === "left-padder");
    const dead = demo.report.packages.find((p) => p.name === "event-stream");
    const template = demo.report.packages.find((p) => p.signals.advisories.available && p.signals.advisories.value.length > 0);
    const pick = (i: number): unknown => (mix === "front" ? (i % 2 === 0 ? possessed : dead) : i === 0 ? possessed : template);
    const big = structuredClone(demo);
    big.report.packages = Array.from({ length: 300 }, (_, i) => ({ ...(structuredClone(pick(i)) as object), name: `pkg-${String(i)}` })) as typeof demo.report.packages;
    delete big.timelines;
    await page.route((url) => url.pathname === "/test/scan-halo.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(big) }));
    await page.goto("/?scan=/test/scan-halo.json");
    await expect(page.locator("button[data-grave-index]")).toHaveCount(300);
    await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
    const times = await page.evaluate(() => (window as unknown as HookWindow).__sextonTiming?.redrawHalo(30) ?? []);
    expect(times).toHaveLength(30);
    const sorted = [...times].sort((a, b) => a - b);
    const median = ((sorted[14] ?? 0) + (sorted[15] ?? 0)) / 2;
    console.log(`median repaint with a fresh Halo layer, ${label}: ${median.toFixed(2)} ms`);
    expect(median).toBeLessThanOrEqual(BUDGET_MS);
  });
}

// Spec judge-path, requirement 5.1 (a new test): a Cold Halo repaint, the layer and its sources both fresh, as after a
// scrubber move that changes which graves are Possessed, on 300 front-row graves.
test("judge-path 5.1: a cold Halo repaint with 300 front-row graves stays inside 16 ms", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  const demo = (await (await page.request.get("/demo/scan.json")).json()) as { report: { packages: { name: string }[] }; timelines?: unknown };
  const possessed = demo.report.packages.find((p) => p.name === "left-padder");
  const dead = demo.report.packages.find((p) => p.name === "event-stream");
  const big = structuredClone(demo);
  big.report.packages = Array.from({ length: 300 }, (_, i) => ({ ...(structuredClone(i % 2 === 0 ? possessed : dead) as object), name: `pkg-${String(i)}` })) as typeof demo.report.packages;
  delete big.timelines;
  await page.route((url) => url.pathname === "/test/scan-cold.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(big) }));
  await page.goto("/?scan=/test/scan-cold.json");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(300);
  await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
  const cold = await page.evaluate(() => (window as unknown as HookWindow).__sextonTiming?.redrawHaloCold(30) ?? []);
  expect(cold).toHaveLength(30);
  const sorted = [...cold].sort((a, b) => a - b);
  const median = ((sorted[14] ?? 0) + (sorted[15] ?? 0)) / 2;
  console.log(`median repaint with a cold Halo layer and sources, 300 front-row graves: ${median.toFixed(2)} ms`);
  expect(median).toBeLessThanOrEqual(BUDGET_MS);
});

test("bug 3: a tooltip that opens above its grave stays while the pointer is over it, and keeps its grave", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const grave = page.locator('button[data-grave-index][aria-label^="left-padder"]');
  await grave.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("left-padder");
  const t = await tip.boundingBox();
  const g = await grave.boundingBox();
  expect(t).not.toBeNull();
  expect(g).not.toBeNull();
  if (t === null || g === null) return;
  // At 1280 px the right place would cover event-stream's name, so the tooltip opens above left-padder.
  expect(t.y + t.height).toBeLessThanOrEqual(g.y);
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.waitForTimeout(400);
  await expect(tip).toContainText("left-padder");
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  await expect(tip).toHaveCount(0);
});

test("review: a tooltip over its own grave stays when the pointer goes back from the tooltip to the grave", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const grave = page.locator('button[data-grave-index][aria-label^="event-stream"]');
  // Spec judge-path, Deliberate test change 11: the scene sizes itself after the fonts and the header settle, so the
  // grave's box is read once it has stopped moving; an early box put the pointer off the grave (2 runs in 10).
  let g = await grave.boundingBox();
  await expect
    .poll(async () => {
      const now = await grave.boundingBox();
      const same = now !== null && g !== null && now.x === g.x && now.y === g.y && now.width === g.width && now.height === g.height;
      g = now;
      return same;
    })
    .toBe(true);
  expect(g).not.toBeNull();
  if (g === null) return;
  // Enter the grave low down, below where its tooltip opens over it.
  await page.mouse.move(g.x + g.width / 2, g.y + g.height - 10);
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("event-stream");
  const t = await tip.boundingBox();
  expect(t).not.toBeNull();
  if (t === null) return;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.waitForTimeout(300);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height - 10);
  await page.waitForTimeout(400);
  await expect(tip).toContainText("event-stream");
});
