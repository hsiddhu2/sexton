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
