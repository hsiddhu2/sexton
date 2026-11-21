import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type Page } from "@playwright/test";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");

const SCREENSHOT = fileURLToPath(new URL("../../../docs/cemetery.png", import.meta.url));
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

  // left-padder is the first Possessed grave in triage order, so it is the first button.
  await page.locator('button[data-grave-index][aria-label^="left-padder"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await waitForFirstPaint(page);
  await page.screenshot({ path: SCREENSHOT });

  // Let the Ghost drift timer run during the timing, which is the worst case.
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // A 300-package response built from the demo scan: every package copies one that carries advisories.
  const demo = (await (await request.get(`${origin}/demo/scan.json`)).json()) as {
    report: { packages: DemoPackage[] };
  };
  const template = demo.report.packages.find((p) => p.signals.advisories.available && p.signals.advisories.value.length > 0);
  expect(template).toBeDefined();
  const big = structuredClone(demo);
  big.report.packages = Array.from({ length: 300 }, (_, i) => ({
    ...structuredClone(template as DemoPackage),
    name: `ghost-${String(i)}`,
  }));
  // Match the pathname only. A glob also matches the navigation URL "/?scan=/test/scan-300.json".
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
  expect(cspViolations).toEqual([]);
});
