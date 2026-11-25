// Spec cemetery-undead-2: browser checks of the name labels, the Bubbles, Sound, the Burst and its budget.
import { existsSync } from "node:fs";
import { chromium, expect, test, type Page } from "@playwright/test";

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
    paintVariant(variant: { ghosts?: boolean }): void;
    redrawBurst(n: number): number[];
  };
}

async function sameOriginOnly(page: Page, baseURL: string | undefined): Promise<void> {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`the Ghosts' drawn pixels clear every name label at ${String(width)} by ${String(height)}`, async ({ page, baseURL }) => {
    await sameOriginOnly(page, baseURL);
    await page.clock.install({ time: new Date("2026-11-24T12:00:00Z") });
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
    await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
    // Past the Load moment, which lasts under a second.
    await page.clock.runFor(1_500);
    // With the clock still, paint once with every Ghost and once with none, and compare each label's pixels.
    const result = await page.evaluate(() => {
      const hook = (window as unknown as HookWindow).__sextonTiming;
      const canvas = document.querySelector("canvas");
      const ctx = canvas?.getContext("2d");
      if (hook === undefined || canvas === null || ctx === null || ctx === undefined) return { labels: 0, differing: -1, ghosts: 0 };
      const k = canvas.width / canvas.getBoundingClientRect().width;
      const labels = hook.labels();
      const read = (): number[][] =>
        labels.map((r) => Array.from(ctx.getImageData(Math.floor(r.x * k), Math.floor(r.y * k), Math.ceil(r.w * k), Math.ceil(r.h * k)).data));
      hook.paintVariant({ ghosts: true });
      const withGhosts = read();
      const whole = Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      hook.paintVariant({ ghosts: false });
      const without = read();
      const wholeWithout = Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      let differing = 0;
      withGhosts.forEach((a, i) => {
        const b = without[i] ?? [];
        if (a.some((v, j) => v !== b[j])) differing += 1;
      });
      // The Ghosts are drawn somewhere: the whole canvas differs between the two paints.
      let ghosts = 0;
      for (let i = 0; i < whole.length; i += 4) if (whole[i] !== wholeWithout[i]) ghosts += 1;
      return { labels: labels.length, differing, ghosts };
    });
    expect(result.labels).toBe(12);
    expect(result.ghosts).toBeGreaterThan(0);
    expect(result.differing).toBe(0);
  });
}

/** Wraps the page's AudioContext so the test can count every one made. */
async function countAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __audioContexts: number };
    w.__audioContexts = 0;
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audioContexts += 1;
      }
    };
  });
}
const audioContexts = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts);

test("no AudioContext exists before Sound is turned on, and a remembered on waits for a key press", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await countAudioContexts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  // Scroll, hover and focus graves: still none.
  await page.mouse.wheel(0, 300);
  const graves = page.locator("button[data-grave-index]");
  await graves.nth(1).hover();
  await graves.nth(2).hover();
  await graves.first().focus();
  expect(await audioContexts(page)).toBe(0);
  const toggle = page.getByRole("button", { name: "Sound off" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  const on = page.getByRole("button", { name: "Sound on" });
  await expect(on).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => audioContexts(page)).toBe(1);
  // Reload with on remembered: none until the first key press, then one.
  await page.reload();
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Sound on" })).toHaveAttribute("aria-pressed", "true");
  await graves.nth(1).hover();
  expect(await audioContexts(page)).toBe(0);
  await page.keyboard.press("Shift");
  await expect.poll(() => audioContexts(page)).toBe(1);
});

test("300 graves repaint within budget during a Burst", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  const demo = (await (await page.request.get("/demo/scan.json")).json()) as {
    report: { packages: { name: string; signals: { advisories: { available: boolean; value: unknown[] } } }[] };
    timelines?: unknown;
  };
  // The smoke test's 300 graves (each a copy of the first package with advisories), with the Possessed left-padder
  // first so the Burst has an open grave to play on.
  const possessed = demo.report.packages.find((p) => p.name === "left-padder");
  const template = demo.report.packages.find((p) => p.signals.advisories.available && p.signals.advisories.value.length > 0);
  expect(possessed).toBeDefined();
  expect(template).toBeDefined();
  const big = structuredClone(demo);
  big.report.packages = Array.from({ length: 300 }, (_, i) => ({ ...structuredClone(i === 0 ? possessed : template), name: `pkg-${String(i)}` })) as typeof demo.report.packages;
  delete big.timelines;
  await page.route((url) => url.pathname === "/test/scan-300-burst.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(big) }),
  );
  await page.goto("/?scan=/test/scan-300-burst.json");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(300);
  await page.waitForFunction(() => (window as unknown as HookWindow).__sextonTiming !== undefined);
  const times = await page.evaluate(() => (window as unknown as HookWindow).__sextonTiming?.redrawBurst(30) ?? []);
  expect(times).toHaveLength(30);
  const sorted = [...times].sort((a, b) => a - b);
  const median = ((sorted[14] ?? 0) + (sorted[15] ?? 0)) / 2;
  console.log(`median redraw of 300 graves during a Burst over 30 paints: ${median.toFixed(2)} ms`);
  expect(median).toBeLessThanOrEqual(16);
});

test("under Reduced motion the axios replay shows the Burst's final pose and caption at once", async ({ page, baseURL }) => {
  await sameOriginOnly(page, baseURL);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?replay=axios");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(1);
  const slider = page.getByRole("slider", { name: "History date" });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(page.locator(".burst-caption")).toHaveText("The wind stops. A grave opens.");
  // The final pose is the still open grave: the zombie stands, so its skin shows inside the grave's box.
  const box = await page.locator("button[data-grave-index]").boundingBox();
  expect(box).not.toBeNull();
  const skin = await page.evaluate((b) => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    const data = (canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(Math.round((b.x - r.left) * k), Math.round((b.y - r.top) * k), Math.round(b.width * k), Math.round(b.height * k)).data;
    let hits = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.abs((data[i] ?? 0) - 0x7f) <= 6 && Math.abs((data[i + 1] ?? 0) - 0xae) <= 6 && Math.abs((data[i + 2] ?? 0) - 0x4e) <= 6) hits += 1;
    return hits;
  }, box ?? { x: 0, y: 0, width: 0, height: 0 });
  expect(skin).toBeGreaterThan(500);
});
