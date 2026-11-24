import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type Page } from "@playwright/test";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");

const SCREENSHOT = fileURLToPath(new URL("../../../docs/cemetery.png", import.meta.url));
const REPLAY_SCREENSHOT = fileURLToPath(new URL("../../../docs/replay-axios.png", import.meta.url));
const BUDGET_MS = 16;

interface TimingWindow {
  __sextonTiming?: { redraw(n: number): number[] };
}

interface DemoPackage {
  name: string;
  signals: { advisories: { available: boolean; value: unknown[] } };
}

/** Resolves once the scene canvas holds a painted pixel: the sky fill makes device pixel (2, 2) opaque. */
async function waitForFirstPaint(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const data = canvas?.getContext("2d")?.getImageData(2, 2, 1, 1).data;
    return data !== undefined && data[3] === 255;
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

test("demo loads under the CSP, then 300 graves redraw within budget", async ({ page, request, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) cspViolations.push(msg.text());
  });
  // Abort every request to a host other than the local server.
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });

  // Reduced motion keeps the Ghost phase at 0, so the screenshot is repeatable.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("header")).toContainText("demo fixture, recorded data");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(12);

  // Spec evidence-pack, Requirement 8.4: both demo evidence links are in the header and both files download.
  for (const [name, path, file] of [
    ["Download evidence pack as JSON", "/demo/evidence.json", "evidence.json"],
    ["Download evidence pack as Markdown", "/demo/evidence.md", "evidence.md"],
  ] as const) {
    const link = page.getByRole("link", { name });
    await expect(link).toHaveAttribute("href", path);
    await expect(link).toHaveAttribute("download", "");
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe(file);
    expect((await request.get(`${origin}${path}`)).status()).toBe(200);
  }

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).not.toBeNull();
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("unsafe-inline");

  // Task 10.2: the README screenshot is the closed cemetery at 1440 by 900 with Reduced motion on.
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForFirstPaint(page);
  await page.screenshot({ path: SCREENSHOT });
  // Back to the configured viewport, and let the Ghost drift timer run during the timing, which is the worst case.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // A 300-package response built from the demo scan: every package copies one that carries advisories.
  const demo = (await (await request.get(`${origin}/demo/scan.json`)).json()) as {
    report: { generatedAt: string; packages: DemoPackage[] };
    timelines?: Record<string, unknown>;
  };
  const template = demo.report.packages.find((p) => p.signals.advisories.available && p.signals.advisories.value.length > 0);
  expect(template).toBeDefined();
  const big = structuredClone(demo);
  big.report.packages = Array.from({ length: 300 }, (_, i) => ({
    ...structuredClone(template as DemoPackage),
    name: `ghost-${String(i)}`,
  }));
  // Match the pathname only. A glob also matches the navigation URL "/?scan=/test/scan-300.json".
  // Every package carries a Timeline, so the scrubber exists and a move re-plans all 300 graves.
  const timeline = {
    installed: "1.0.0",
    coveredFrom: null,
    segments: [
      { from: "2019-01-01T00:00:00.000Z", state: null, reason: "installed version not yet published", ghost: false },
      { from: "2020-01-01T00:00:00.000Z", state: "Alive", reason: "no rule matched", ghost: false },
      { from: "2022-01-01T00:00:00.000Z", state: "Restless", reason: "no release in 24 months", ghost: false },
      { from: big.report.generatedAt, state: "Haunted", reason: "advisory of severity High or Critical", ghost: true },
    ],
  };
  big.timelines = Object.fromEntries(big.report.packages.map((p) => [p.name, structuredClone(timeline)]));
  await page.route((url) => url.pathname === "/test/scan-300.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(big) }),
  );

  await page.goto("/?scan=/test/scan-300.json");
  await expect(page.locator("button[data-grave-index]")).toHaveCount(300);
  await page.waitForFunction(() => (window as unknown as TimingWindow).__sextonTiming !== undefined);
  await waitForFirstPaint(page);
  const times = await page.evaluate(() => (window as unknown as TimingWindow).__sextonTiming?.redraw(30) ?? []);
  expect(times).toHaveLength(30);
  const med = median(times);
  console.log(`median redraw of 300 graves over 30 paints: ${med.toFixed(2)} ms`);
  expect(med).toBeLessThanOrEqual(BUDGET_MS);
  // Spec cemetery-time, 12.6: a second timed pass after a scrubber move (Home, then one step right), by keyboard.
  const scrubber = page.getByRole("slider", { name: "History date" });
  await scrubber.focus();
  await scrubber.press("Home");
  await scrubber.press("ArrowRight");
  await expect(scrubber).toHaveAttribute("aria-valuetext", /^1 Jan 2020/);
  await waitForFirstPaint(page);
  const moved = await page.evaluate(() => (window as unknown as TimingWindow).__sextonTiming?.redraw(30) ?? []);
  expect(moved).toHaveLength(30);
  const movedMedian = median(moved);
  console.log(`median redraw of 300 graves after a scrubber move over 30 paints: ${movedMedian.toFixed(2)} ms`);
  expect(movedMedian).toBeLessThanOrEqual(BUDGET_MS);
  expect(cspViolations).toEqual([]);
});

// Spec cemetery-time-fixes, task 6.1 (requirement 9.2): the README picture of a replay.
test("the axios replay at its Possessed stop, for the README", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?replay=axios");
  const grave = page.locator("button[data-grave-index]").first();
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.0, Alive");
  const scrubber = page.getByRole("slider", { name: "History date" });
  await scrubber.focus();
  await scrubber.press("ArrowRight");
  await expect(grave).toHaveAttribute("aria-label", "axios 1.14.1, Possessed");
  await expect(page.locator('[role="note"]')).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // A replay names itself in the header and shows no policy line (its policy is for the replay's end time).
  await expect(page.locator(".repo-text")).toHaveText("Replay: axios npm compromise, 31 March 2026");
  await expect(page.locator(".header-policy")).toHaveCount(0);
  // Move focus off the slider so no focus ring is in the picture, then wait two frames for the repaint.
  await scrubber.blur();
  await waitForFirstPaint(page);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: REPLAY_SCREENSHOT });
});
