// Spec remediate, Requirement 9: the drawer opens a pull request through a mocked POST /api/remediate.
// Every request leaves the local server only to the two mocked API paths, which never reach a network.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");

const DEMO = fileURLToPath(new URL("../public/demo/scan.json", import.meta.url));
const PR_URL = ["https://github.com", "hsiddhu2", "sexton-demo", "pull", "9"].join("/");

test("a hosted scan of the demo repository opens a pull request from the drawer", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  const demo = JSON.parse(readFileSync(DEMO, "utf8")) as {
    report: { scan: { repo: { url: string } } };
    remediations: { packageName: string; status: string; intent?: unknown }[];
  };
  const proposed = demo.remediations.find((r) => r.status === "proposed" && r.intent !== undefined);
  expect(proposed).toBeDefined();
  const sent: { headers: Record<string, string>; body: string | null }[] = [];

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/api/scan") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...demo, actions: { remediate: true } }) });
    if (url.pathname === "/api/remediate") {
      sent.push({ headers: route.request().headers(), body: route.request().postData() });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "opened", prUrl: PR_URL, logged: true }) });
    }
    return route.continue();
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Repository URL").fill("https://github.com/hsiddhu2/sexton-demo");
  await page.getByLabel("Repository URL").press("Enter");
  await page.locator(`button[data-grave-index][aria-label^="${proposed?.packageName ?? ""}"]`).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Open pull request" }).focus();
  await page.keyboard.press("Enter");
  const link = dialog.getByRole("link", { name: "View the pull request on GitHub" });
  await expect(link).toHaveAttribute("href", PR_URL);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toBeInViewport();
  await expect(dialog.getByRole("status")).toBeInViewport();
  expect(sent).toHaveLength(1);
  expect(sent[0]?.headers["content-type"]).toBe("application/json");
  expect(sent[0]?.headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.parse(sent[0]?.body ?? "{}")).toEqual({ repo: demo.report.scan.repo.url, package: proposed?.packageName });
});
