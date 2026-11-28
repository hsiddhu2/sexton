// Spec home-page, task 5.2: the Home page and the new addresses in a real browser, each case in a fresh browser
// context (a fresh profile: no stored value, no history). The API is routed in the page and every request to it is
// counted, so no request reaches a real API and none leaves the local server.
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, expect, test, type Page, type Route } from "@playwright/test";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");
test.use({ actionTimeout: 10_000, navigationTimeout: 10_000 });

const AXE_PATH = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const API = "/api";
const DEMO_REPO = "hsiddhu2/sexton-demo";
const HOME_TITLE = "Sexton: find the dependencies that will hurt you";
const SECTIONS = ["top", "attacks", "how", "where", "kiro", "roadmap", "open"];
/** The sections an address can name by its id (2.2). */
const SECTION_IDS = ["attacks", "how", "where", "kiro", "roadmap", "open"] as const;
/** Where the owner's screenshots go when the run names a folder; otherwise the test output folder. */
const SHOTS = process.env["HOME_SHOTS_DIR"];

let DEMO_BODY = "";
test.beforeAll(async ({ playwright }, info) => {
  const api = await playwright.request.newContext({ baseURL: info.project.use.baseURL ?? "http://localhost:4173" });
  DEMO_BODY = await (await api.get("/demo/scan.json")).text();
  await api.dispose();
});

interface Guard {
  /** Every API request, path and query. */
  readonly api: string[];
  /** Every request off the page origin (all aborted). */
  readonly foreign: string[];
}

/** Routes the API to the demo scan and aborts anything off the page origin. */
async function guard(page: Page, origin: string): Promise<Guard> {
  const api: string[] = [];
  const foreign: string[] = [];
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      foreign.push(url.href);
      return route.abort();
    }
    if (url.pathname.startsWith(`${API}/`)) {
      api.push(`${url.pathname}${url.search}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: DEMO_BODY });
    }
    return route.continue();
  });
  return { api, foreign };
}

const originOf = (baseURL: string | undefined): string => new URL(baseURL ?? "http://localhost:4173").origin;
const scans = (g: Guard): number => g.api.filter((p) => p.startsWith(`${API}/scan?repo=`)).length;
const graves = (page: Page) => page.locator("button[data-grave-index]");

async function onHomePage(page: Page): Promise<void> {
  await expect(page.locator(".hp")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
}

async function noSideScroll(page: Page, width: number): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

async function axe(page: Page, view: string): Promise<void> {
  if ((await page.evaluate(() => "axe" in window)) === false) await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(ctx: Document, o: object): Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe;
    const r = await run.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`);
  });
  expect(violations, view).toEqual([]);
}

for (const size of [
  { name: "1440 by 900", width: 1440, height: 900, phone: false },
  { name: "390 by 844", width: 390, height: 844, phone: true },
]) {
  test.describe(`the Home page at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    test("shows every section in order, its pictures and footer, with no request off the origin or to the API", async ({ page, baseURL }) => {
      const g = await guard(page, originOf(baseURL));
      await page.goto("/");
      await onHomePage(page);
      await expect(page).toHaveTitle(HOME_TITLE);
      expect(await page.locator("main > section").evaluateAll((els) => els.map((e) => e.id))).toEqual(SECTIONS);
      for (const id of SECTIONS) await expect(page.locator(`section#${id}`)).toBeVisible();
      await expect(page.locator("#video")).toHaveCount(0);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText("Find the dependencies that will hurt you. Prove it. Open the fix.");
      for (const img of ["/cemetery.png", "/replay-axios.png", "/replay-keyv.png"]) {
        const loaded = await page.locator(`img[src="${img}"]`).evaluate(async (el) => {
          const image = el as HTMLImageElement;
          image.scrollIntoView();
          await image.decode().catch(() => undefined);
          return image.naturalWidth;
        });
        expect(loaded, img).toBe(1440);
      }
      await expect(page.locator(".hp-state-name")).toHaveText(["Possessed", "Dead", "Haunted", "Restless", "Alive"]);
      const possessed = await page.locator(".hp-state-possessed .hp-state-name").evaluate((el) => getComputedStyle(el).color);
      expect(possessed).toBe("rgb(204, 121, 167)");
      await expect(page.locator(".hp-stop")).toHaveCount(4);
      await expect(page.locator(".hp-stop-lit .hp-stone")).toHaveText("0.1");
      await expect(page.locator(".hp-footer")).toContainText("Music: Ghost Party by The Piano Says, CC BY 3.0");
      await expect(page.locator(".hp-footer a", { hasText: "Ghost Party by The Piano Says" })).toHaveAttribute("href", /^https:\/\//);
      expect(g.foreign, "requests off the page origin").toEqual([]);
      expect(g.api, "API requests").toEqual([]);
    });

    test("scrolls as a normal page with no horizontal scroll, the Top bar sticky with both tabs", async ({ page, baseURL }) => {
      await guard(page, originOf(baseURL));
      await page.goto("/");
      await onHomePage(page);
      await noSideScroll(page, size.width);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(size.height * 2);
      const header = page.locator("header.site-header");
      // The wordmark, GitHub and Try the demo share the first row. On a phone the tabs open the second (12.11).
      const row = await header.locator(".wordmark, .bar-end a").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
      expect(Math.max(...row) - Math.min(...row), `centres ${row.join(", ")}`).toBeLessThanOrEqual(4);
      await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
      const tabs = page.getByRole("navigation", { name: "Site" });
      await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
      await expect(tabs.getByRole("link", { name: "Cemetery" })).toBeVisible();
      await page.mouse.wheel(0, 3000);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
      const top = await header.boundingBox();
      expect(top?.y).toBe(0);
      await noSideScroll(page, size.width);
    });

    test("axe finds no violation", async ({ browser, baseURL }) => {
      const context = await browser.newContext({ bypassCSP: true, viewport: { width: size.width, height: size.height } });
      const page = await context.newPage();
      await guard(page, originOf(baseURL));
      await page.goto("/");
      await onHomePage(page);
      await axe(page, "the Home page");
      await context.close();
    });

    test("takes the owner's screenshot", async ({ page, baseURL }) => {
      await guard(page, originOf(baseURL));
      await page.goto("/");
      await onHomePage(page);
      await page.evaluate(async () => {
        for (const img of document.querySelectorAll("img")) await img.decode().catch(() => undefined);
        await document.fonts.ready;
      });
      const dir = SHOTS ?? test.info().outputDir;
      mkdirSync(dir, { recursive: true });
      const name = `home-page-${String(size.width)}x${String(size.height)}`;
      await page.screenshot({ path: join(dir, `${name}.png`) });
      await page.screenshot({ path: join(dir, `${name}-full.png`), fullPage: true });
    });
  });
}

test.describe("the Top bar and the in-site links (2.1, 2.2, 4.3, 10.1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("an address ending in a section's id scrolls its heading below the sticky Top bar, at 1440 and 390 px wide", async ({ page, baseURL }) => {
    await guard(page, originOf(baseURL));
    for (const [width, id] of [...SECTION_IDS.map((i) => [1440, i] as const), ...SECTION_IDS.map((i) => [390, i] as const)]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(`/#${id}`);
      await onHomePage(page);
      const barBottom = (await page.locator("header.site-header").boundingBox())?.height ?? 0;
      await expect.poll(async () => (await page.locator(`#${id} h2`).boundingBox())?.y ?? -1, `${id} at ${String(width)}`).toBeGreaterThanOrEqual(barBottom);
      // Each heading lands near the top. The last section cannot scroll that far, so it only has to be in view.
      const y = (await page.locator(`#${id} h2`).boundingBox())?.y ?? 9999;
      expect(y, `${id} at ${String(width)}`).toBeLessThan(id === "open" ? (width === 1440 ? 900 : 844) - 40 : 400);
      expect(await page.evaluate(() => window.scrollY), id).toBeGreaterThan(0);
    }
  });

  test("Try the demo, Walk the sample cemetery and the replay links open the cemetery without a reload", async ({ page, baseURL }) => {
    const g = await guard(page, originOf(baseURL));
    const cases: [string, number, string, string][] = [
      ["Try the demo", 0, "/cemetery", ""],
      ["Walk the sample cemetery", 0, "/cemetery", ""],
      ["Watch the axios replay", 0, "/cemetery", "?replay=axios"],
      ["Watch the keyv replay", 0, "/cemetery", "?replay=keyv"],
      ["Try the demo", 1, "/cemetery", ""],
    ];
    for (const [name, index, path, search] of cases) {
      await page.goto("/");
      await onHomePage(page);
      await page.evaluate(() => {
        (window as unknown as { __noReload?: boolean }).__noReload = true;
      });
      await page.getByRole("link", { name }).nth(index).click();
      await expect(graves(page).first()).toBeVisible();
      const url = new URL(page.url());
      expect([url.pathname, url.search], name).toEqual([path, search]);
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload), name).toBe(true);
      if (search !== "") await expect(page.locator(".replay-view")).toBeVisible();
    }
    await page.goto("/");
    await expect(page.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/hsiddhu2/sexton");
    await expect(page.getByRole("link", { name: "Star on GitHub" })).toHaveAttribute("href", "https://github.com/hsiddhu2/sexton");
    await expect(page.getByRole("link", { name: "Install the Kiro Power" })).toHaveAttribute("href", "https://github.com/hsiddhu2/sexton/tree/main/powers/sexton");
    expect(g.api).toEqual([]);
  });
});

test.describe("addresses (1.4, 1.5, 1.9, 12.1, 12.4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("forwards /?replay= and /?repo= in place, with no new history entry", async ({ page, baseURL }) => {
    const g = await guard(page, originOf(baseURL));
    await page.goto("/");
    await onHomePage(page);
    await page.goto("/?replay=axios");
    const length = await page.evaluate(() => history.length);
    await expect(page.locator(".replay-view")).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/cemetery?replay=axios");
    expect(await page.evaluate(() => history.length)).toBe(length);
    await page.goBack();
    await onHomePage(page);
    await page.goto(`/?repo=${encodeURIComponent(`https://github.com/${DEMO_REPO}`)}`);
    await expect(page.getByRole("button", { name: "Scan this repository" })).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/scan?repo=${DEMO_REPO}`);
    expect(scans(g), "an address alone waits for a press").toBe(0);
    await page.goto("/?page=guide");
    await expect(page.locator("main.guide")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/cemetery");
  });

  test("the wordmark goes to / from the Sample scan, a Replay and the Guide page, and Back returns", async ({ page, baseURL }) => {
    await guard(page, originOf(baseURL));
    for (const [start, ready] of [
      ["/cemetery", "button[data-grave-index]"],
      ["/cemetery?replay=keyv", ".replay-view"],
      ["/cemetery?page=guide", "main.guide"],
    ] as const) {
      await page.goto(start);
      await expect(page.locator(ready).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Sexton, home page" })).toHaveAttribute("href", "/");
      await page.getByRole("link", { name: "Sexton, home page" }).click();
      await onHomePage(page);
      await expect(page).toHaveTitle(HOME_TITLE);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await page.goBack();
      await expect(page.locator(ready).first()).toBeVisible();
      await expect(page).toHaveTitle("Sexton cemetery");
    }
  });

  test("going to / clears both Scan boxes", async ({ page, baseURL }) => {
    await guard(page, originOf(baseURL));
    await page.goto("/");
    await page.getByLabel("GitHub repository", { exact: true }).fill("someone/half-typed");
    await page.getByRole("link", { name: "Try the demo" }).first().click();
    await expect(graves(page).first()).toBeVisible();
    await page.getByLabel("GitHub repository to scan").fill("other/typed");
    await page.getByRole("link", { name: "Sexton, home page" }).click();
    await onHomePage(page);
    await expect(page.getByLabel("GitHub repository", { exact: true })).toHaveValue("");
    await page.getByRole("link", { name: "Try the demo" }).first().click();
    await expect(graves(page).first()).toBeVisible();
    await expect(page.getByLabel("GitHub repository to scan")).toHaveValue("");
    await page.goBack();
    await onHomePage(page);
    await expect(page.getByLabel("GitHub repository", { exact: true })).toHaveValue("");
  });
});

test.describe("the scan cache and Recent scans (13, 14)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("a refresh inside 15 minutes makes no API request, and Rescan makes exactly one", async ({ page, baseURL }) => {
    const g = await guard(page, originOf(baseURL));
    await page.goto("/");
    await page.getByLabel("GitHub repository", { exact: true }).fill(DEMO_REPO);
    await page.getByRole("button", { name: "Scan your repo" }).click();
    await expect(graves(page).first()).toBeVisible();
    await expect(page.locator(".scan-tag")).toHaveText(DEMO_REPO);
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/scan?repo=${DEMO_REPO}`);
    expect(scans(g)).toBe(1);
    expect(g.api[0]).toBe(`${API}/scan?repo=${encodeURIComponent(`https://github.com/${DEMO_REPO}`)}`);
    await expect(page.getByRole("button", { name: "Rescan" })).toHaveCount(0);

    await page.reload();
    await expect(graves(page).first()).toBeVisible();
    await expect(page.locator(".cached-line")).toContainText("Scanned just now");
    expect(scans(g), "the reload is served from the cache").toBe(1);

    // A new visit to the same address in this browser is served too.
    await page.goto("/");
    await page.goto(`/scan?repo=${DEMO_REPO}`);
    await expect(page.locator(".cached-line")).toBeVisible();
    expect(scans(g)).toBe(1);

    await page.getByRole("button", { name: "Rescan" }).click();
    await expect(page.getByRole("button", { name: "Rescan" })).toHaveCount(0);
    await expect(graves(page).first()).toBeVisible();
    expect(scans(g), "Rescan").toBe(2);
    const saved = await page.evaluate(() => {
      const text = localStorage.getItem("sexton:scans");
      return text === null ? null : (JSON.parse(text) as { entries: { key: string; response: unknown }[] }).entries.map((e) => [e.key, e.response !== null]);
    });
    expect(saved).toEqual([[DEMO_REPO, true]]);
  });

  test("an entry older than 15 minutes is not served", async ({ page, baseURL }) => {
    const g = await guard(page, originOf(baseURL));
    await page.goto("/");
    await page.evaluate(
      ({ body, repo }) => {
        localStorage.setItem("sexton:scans", JSON.stringify({ v: 1, entries: [{ key: repo, label: repo, savedAt: Date.now() - 16 * 60_000, response: JSON.parse(body) as unknown }] }));
      },
      { body: DEMO_BODY, repo: DEMO_REPO },
    );
    await page.goto(`/scan?repo=${DEMO_REPO}`);
    await expect(page.getByRole("button", { name: "Scan this repository" })).toBeVisible();
    expect(scans(g)).toBe(0);
    await expect(page.locator(".cached-line")).toHaveCount(0);
  });

  test("Recent scans show on the Home page and in the header, rows scan from the cache, and Clear empties it", async ({ page, baseURL }) => {
    const g = await guard(page, originOf(baseURL));
    await page.goto("/");
    await expect(page.getByRole("group", { name: "Recent scans" })).toHaveCount(0);
    await page.getByLabel("GitHub repository", { exact: true }).fill(DEMO_REPO);
    await page.getByRole("button", { name: "Scan your repo" }).click();
    await expect(graves(page).first()).toBeVisible();
    expect(scans(g)).toBe(1);

    // In the header's example list, above Try one.
    await page.getByLabel("GitHub repository to scan").focus();
    const pop = page.locator(".examples");
    await expect(pop.getByRole("group", { name: "Recent scans" })).toBeVisible();
    await expect(pop.locator(".recent-row")).toHaveText([`${DEMO_REPO}just now`]);
    await pop.locator(".recent-row").click();
    await expect(graves(page).first()).toBeVisible();
    expect(scans(g), "a row with a Fresh Entry").toBe(1);

    // On the Home page under the Scan box.
    await page.getByRole("link", { name: "Sexton, home page" }).click();
    await onHomePage(page);
    const recent = page.locator(".hp-recent");
    await expect(recent.locator(".recent-row")).toHaveText([`${DEMO_REPO}just now`]);
    await recent.locator(".recent-row").click();
    await expect(page.locator(".cached-line")).toBeVisible();
    expect(scans(g)).toBe(1);

    await page.getByRole("link", { name: "Sexton, home page" }).click();
    await onHomePage(page);
    await recent.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByRole("group", { name: "Recent scans" })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("sexton:scans"))).toBeNull();

    // Clear in the header list too.
    await page.getByLabel("GitHub repository", { exact: true }).fill(DEMO_REPO);
    await page.getByRole("button", { name: "Scan your repo" }).click();
    await expect(graves(page).first()).toBeVisible();
    expect(scans(g)).toBe(2);
    await page.getByLabel("GitHub repository to scan").focus();
    await pop.getByRole("button", { name: "Clear" }).click();
    await expect(pop.getByRole("group", { name: "Recent scans" })).toHaveCount(0);
    await expect(pop).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("sexton:scans"))).toBeNull();
  });

  test("with storage blocked the page works, every scan asks the API, and no Recent scans show", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    const g = await guard(page, originOf(baseURL));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await onHomePage(page);
    await page.getByLabel("GitHub repository", { exact: true }).fill(DEMO_REPO);
    await page.getByRole("button", { name: "Scan your repo" }).click();
    await expect(graves(page).first()).toBeVisible();
    expect(scans(g)).toBe(1);
    await page.reload();
    await expect(graves(page).first()).toBeVisible();
    // The clean-site reload rule (10.12) starts the visitor's own scan again.
    await expect.poll(() => scans(g)).toBe(2);
    await expect(page.locator(".cached-line")).toHaveCount(0);
    await page.getByLabel("GitHub repository to scan").focus();
    await expect(page.getByRole("group", { name: "Recent scans" })).toHaveCount(0);
    await page.getByRole("link", { name: "Sexton, home page" }).click();
    await onHomePage(page);
    await expect(page.getByRole("group", { name: "Recent scans" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("phone width (16.4)", () => {
  for (const width of [360, 390]) {
    test(`no horizontal scroll on the Home page at ${String(width)} px`, async ({ page, baseURL }) => {
      await guard(page, originOf(baseURL));
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await onHomePage(page);
      await noSideScroll(page, width);
      for (const id of SECTIONS) {
        await page.locator(`section#${id}`).scrollIntoViewIfNeeded();
        await noSideScroll(page, width);
      }
    });
  }
});

// Spec home-page, 12.5 to 12.11: one Top bar on every page. The wordmark and the tabs sit at the same place on the
// Home page and in the Cemetery view. The Cemetery view's bar stays one row of at most 64 px with room to spare (fonts
// render wider on Linux Chromium), and the page does not scroll with the Welcome bar open or closed, with the Music
// button showing and the longest scan tag.
/** The longest repository GitHub allows: a 39-character owner and a 100-character name. */
const LONG_REPO = `${"o".repeat(39)}/${"r".repeat(100)}`;
/** The width the Scan field keeps at the least in the Wide layout, in px (12.9). */
const MIN_FIELD = 300;

interface Bar {
  readonly wordmarkX: number;
  readonly wordmarkFont: string;
  readonly height: number;
  readonly tabs: readonly string[];
  readonly rows: number;
  readonly field: number | null;
  readonly scroll: number;
  readonly viewport: number;
  readonly sideScroll: boolean;
}

async function bar(page: Page): Promise<Bar> {
  return page.evaluate(() => {
    const header = document.querySelector("header.site-header") as HTMLElement;
    const kids = [...header.children].filter((el) => getComputedStyle(el).display !== "none") as HTMLElement[];
    const mids = kids.map((el) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2);
    const wordmark = header.querySelector(".wordmark") as HTMLElement;
    const field = header.querySelector(".scan-wrap");
    return {
      wordmarkX: wordmark.getBoundingClientRect().x,
      wordmarkFont: getComputedStyle(wordmark).fontSize,
      height: header.getBoundingClientRect().height,
      tabs: [...header.querySelectorAll(".site-tab")].map((t) => {
        const box = t.getBoundingClientRect();
        return `${t.textContent ?? ""}@${String(Math.round(box.x))},${String(Math.round(box.y))}`;
      }),
      rows: Math.max(...mids) - Math.min(...mids) <= 6 ? 1 : 2,
      field: field === null ? null : field.getBoundingClientRect().width,
      scroll: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
      sideScroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

/** Checks the tabs: their order, addresses, the current mark and its look, never the gold accent (12.5, 12.7). */
async function checkTabs(page: Page, current: "Overview" | "Cemetery"): Promise<void> {
  const nav = page.locator("header.site-header").getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link")).toHaveText(["Overview", "Cemetery"]);
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/");
  await expect(nav.getByRole("link", { name: "Cemetery" })).toHaveAttribute("href", "/cemetery");
  const look = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll<HTMLElement>("header.site-header .site-tab")];
    const glyph = document.querySelector("header.site-header .wordmark-glyph") as SVGElement;
    return {
      accent: getComputedStyle(glyph).color,
      tabs: tabs.map((t) => ({ text: t.textContent, current: t.getAttribute("aria-current"), colour: getComputedStyle(t).color, line: getComputedStyle(t).textDecorationLine, weight: getComputedStyle(t).fontWeight, size: getComputedStyle(t).fontSize, height: t.getBoundingClientRect().height })),
    };
  });
  const on = look.tabs.find((t) => t.text === current);
  const off = look.tabs.find((t) => t.text !== current);
  expect(on?.current).toBe("page");
  expect(off?.current).toBeNull();
  expect(on?.line).toBe("underline");
  expect(off?.line).toBe("none");
  expect(on?.colour).not.toBe(off?.colour);
  for (const t of look.tabs) {
    expect(t.colour, `${String(t.text)} is not gold`).not.toBe(look.accent);
    expect(t.size).toBe("13px");
  }
  expect(on?.weight).toBe(off?.weight);
}

for (const size of [
  { name: "1440 by 900", width: 1440, height: 900 },
  { name: "1366 by 768", width: 1366, height: 768 },
  { name: "1280 by 800", width: 1280, height: 800 },
]) {
  test.describe(`the Top bar at ${size.name} (12.5 to 12.9)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    const fits = async (page: Page, when: string): Promise<void> => {
      await expect(page.getByRole("button", { name: "Music" })).toBeVisible();
      await expect.poll(async () => (await bar(page)).scroll, `the page height ${when}`).toBe(size.height);
      const b = await bar(page);
      console.log(`top bar ${size.name} ${when}: wordmark ${String(b.wordmarkX)} px at ${b.wordmarkFont}, bar ${String(b.height)} px, tabs ${b.tabs.join(" ")}, field ${String(Math.round(b.field ?? 0))} px, page ${String(b.scroll)} of ${String(b.viewport)} px`);
      expect(b.height, when).toBeLessThanOrEqual(64);
      expect(b.rows, when).toBe(1);
      expect(b.field ?? 0, when).toBeGreaterThanOrEqual(MIN_FIELD);
      expect(await page.evaluate(() => window.scrollY), when).toBe(0);
    };

    test("is the same bar on the Home page and in the Cemetery view: wordmark, type, height and tabs", async ({ page, baseURL }) => {
      await guard(page, originOf(baseURL));
      await page.goto("/");
      await onHomePage(page);
      await checkTabs(page, "Overview");
      const home = await bar(page);
      // Every control in the Home page's bar shares the buttons' height and text size (12.8).
      const homeControls = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("header.site-header .site-tab, header.site-header .ib, header.site-header .bar-cta")].map((e) => [e.textContent, e.getBoundingClientRect().height, getComputedStyle(e).fontSize]));
      expect(homeControls.length).toBe(4);
      for (const [text, h, f] of homeControls) expect([text, h, f]).toEqual([text, 36, "13px"]);
      console.log(`top bar ${size.name} Home page: wordmark ${String(home.wordmarkX)} px at ${home.wordmarkFont}, bar ${String(home.height)} px, tabs ${home.tabs.join(" ")}, page ${String(home.scroll)} of ${String(home.viewport)} px`);
      await page.locator("header.site-header").getByRole("link", { name: "Cemetery" }).click();
      await expect(graves(page).first()).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/cemetery");
      await checkTabs(page, "Cemetery");
      const cemetery = await bar(page);
      expect([cemetery.wordmarkX, cemetery.wordmarkFont, cemetery.height, cemetery.tabs]).toEqual([home.wordmarkX, home.wordmarkFont, home.height, home.tabs]);
      expect(home.height).toBeLessThanOrEqual(64);
      expect(home.rows).toBe(1);
      const heights = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("header.site-header .site-tab, header.site-header .ib")].map((e) => [e.getBoundingClientRect().height, getComputedStyle(e).fontSize]));
      for (const [h, f] of heights) expect([h, f]).toEqual([36, "13px"]);
    });

    test("fits on the Sample scan with the Welcome bar open and closed", async ({ page, baseURL }) => {
      const g = await guard(page, originOf(baseURL));
      await page.goto("/cemetery");
      await expect(graves(page).first()).toBeVisible();
      await checkTabs(page, "Cemetery");
      const welcome = page.getByRole("region", { name: "Welcome" });
      await expect(welcome).toBeVisible();
      await fits(page, "Sample scan, Welcome bar open");
      await welcome.getByRole("button", { name: "Close the welcome bar" }).click();
      await expect(welcome).toHaveCount(0);
      await fits(page, "Sample scan, Welcome bar closed");
      expect(g.api).toEqual([]);
      expect(g.foreign).toEqual([]);
    });

    test("fits on a Live scan with the longest scan tag, the Welcome bar open and closed", async ({ page, baseURL }) => {
      const g = await guard(page, originOf(baseURL));
      await page.goto("/cemetery");
      await expect(graves(page).first()).toBeVisible();
      const field = page.getByLabel("GitHub repository to scan");
      await field.fill(LONG_REPO);
      await field.press("Enter");
      await expect.poll(() => scans(g)).toBe(1);
      await expect(page).toHaveURL(new RegExp(`/scan\\?repo=${LONG_REPO}$`));
      await expect(graves(page).first()).toBeVisible();
      await page.keyboard.press("Escape");
      if (size.width >= 1300) await expect(page.locator(".scan-tag")).toHaveText(LONG_REPO);
      await checkTabs(page, "Cemetery");
      const welcome = page.getByRole("region", { name: "Welcome" });
      await expect(welcome).toBeVisible();
      await fits(page, "longest tag, Welcome bar open");
      await welcome.getByRole("button", { name: "Close the welcome bar" }).click();
      await expect(welcome).toHaveCount(0);
      await fits(page, "longest tag, Welcome bar closed");
      expect(g.foreign).toEqual([]);
    });

    test("marks Cemetery on a Replay and the Guide page, Cemetery takes the Home action, Overview goes to / with the Scan boxes empty", async ({ page, baseURL }) => {
      const g = await guard(page, originOf(baseURL));
      for (const address of ["/cemetery?replay=axios", "/cemetery?page=guide"]) {
        await page.goto(address);
        await checkTabs(page, "Cemetery");
        const b = await bar(page);
        expect([address, b.height <= 64, b.rows]).toEqual([address, true, 1]);
        await page.locator("header.site-header").getByRole("link", { name: "Cemetery" }).click();
        await expect(graves(page).first()).toBeVisible();
        await expect(page).toHaveURL(/\/cemetery$/);
        await expect(page.locator(".replay-view, main.guide")).toHaveCount(0);
      }
      await page.getByLabel("GitHub repository to scan").fill("expressjs/express");
      await page.locator("header.site-header").getByRole("link", { name: "Overview" }).click();
      await onHomePage(page);
      expect(new URL(page.url()).search).toBe("");
      await expect(page).toHaveTitle(HOME_TITLE);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.getByLabel("GitHub repository", { exact: true })).toHaveValue("");
      await page.locator("header.site-header").getByRole("link", { name: "Cemetery" }).click();
      await expect(graves(page).first()).toBeVisible();
      await expect(page.getByLabel("GitHub repository to scan")).toHaveValue("");
      expect(g.api).toEqual([]);
      expect(g.foreign).toEqual([]);
    });
  });
}

for (const width of [1099, 900, 700]) {
  test(`the Top bar at ${String(width)} px wide is one row of at most 64 px with both tabs' words on both pages (12.10)`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await guard(page, originOf(baseURL));
    const seen: Bar[] = [];
    for (const address of ["/", "/cemetery", "/cemetery?replay=keyv", "/cemetery?page=guide"]) {
      await page.goto(address);
      await checkTabs(page, address === "/" ? "Overview" : "Cemetery");
      const b = await bar(page);
      seen.push(b);
      expect([address, b.height <= 64, b.rows, b.sideScroll]).toEqual([address, true, 1, false]);
      for (const tab of await page.locator("header.site-header .site-tab").all()) expect((await tab.boundingBox())?.width ?? 0).toBeGreaterThan(50);
      if (address === "/cemetery") {
        console.log(`top bar ${String(width)} px: bar ${String(b.height)} px, field ${String(Math.round(b.field ?? 0))} px, tabs ${b.tabs.join(" ")}`);
        await expect(page.locator(".ib-guide")).toHaveAccessibleName("What is Sexton?");
        expect(b.field ?? 0).toBeGreaterThan(150);
      }
    }
    expect(seen.map((b) => [b.wordmarkX, b.height, b.tabs])).toEqual(seen.map(() => [seen[0]?.wordmarkX, seen[0]?.height, seen[0]?.tabs]));
  });
}

// Spec home-page, 3.8 and 12.12: every Scan box shows a hint that fits whole inside its field, at every width from 360 px.
const HINT_WIDTHS = [360, 390, 700, 1280, 1366, 1440] as const;
const LONG_HINTS = ["owner/name, for example expressjs/express", "Scan a GitHub repo, for example  facebook/react"];

async function scanHint(page: Page, onHome: boolean): Promise<{ text: string; need: number; room: number; longNeed: number }> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.evaluate((home) => {
    const input = document.querySelector<HTMLInputElement>(home ? "#hp-repo" : ".scan-form input") as HTMLInputElement;
    const style = getComputedStyle(input, "::placeholder");
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const box = getComputedStyle(input);
    // The text area is the box less its padding and borders (Chromium's clientWidth for an input already leaves out the padding).
    const room = input.getBoundingClientRect().width - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight) - parseFloat(box.borderLeftWidth) - parseFloat(box.borderRightWidth);
    const long = home ? "owner/name, for example expressjs/express" : "Scan a GitHub repo, for example  facebook/react";
    return { text: input.placeholder, need: ctx.measureText(input.placeholder).width, room, longNeed: ctx.measureText(long).width };
  }, onHome);
}

test("every Scan box shows a hint that fits whole inside its field at 360, 390, 700, 1280, 1366 and 1440 px (3.8, 12.12)", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const g = await guard(page, originOf(baseURL));
  for (const width of HINT_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const address of ["/", "/cemetery"]) {
      await page.goto(address);
      const onHome = address === "/";
      await expect(page.locator(onHome ? "#hp-repo" : ".scan-form input")).toBeVisible();
      await expect.poll(async () => { const h = await scanHint(page, onHome); return h.need <= h.room; }, { message: `${address} at ${String(width)} px` }).toBe(true);
      const hint = await scanHint(page, onHome);
      console.log(`scan hint ${String(width)} px ${address}: "${hint.text}" needs ${hint.need.toFixed(0)} px of ${hint.room.toFixed(0)} px`);
      expect(["owner/name", ...LONG_HINTS]).toContain(hint.text);
      expect(hint.need, `${address} at ${String(width)} px`).toBeLessThanOrEqual(hint.room);
      // The long hint shows wherever it fits with 4 px to spare, and only there.
      expect(hint.text === LONG_HINTS[onHome ? 0 : 1], `${address} at ${String(width)} px long hint`).toBe(hint.longNeed + 4 <= hint.room);
    }
  }
  expect(g.foreign).toEqual([]);
});

for (const width of [390, 360]) {
  test(`the Top bar at ${String(width)} px wide shows both tabs, reachable by their names, on both pages (12.11, 16.4)`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const g = await guard(page, originOf(baseURL));
    for (const address of ["/", "/cemetery?replay=keyv", "/cemetery?page=guide", "/cemetery"]) {
      await page.goto(address);
      await checkTabs(page, address === "/" ? "Overview" : "Cemetery");
      for (const name of ["Overview", "Cemetery"]) {
        const tab = page.locator("header.site-header").getByRole("link", { name, exact: true });
        await expect(tab).toBeVisible();
        const box = await tab.boundingBox();
        expect(box === null ? -1 : box.x + box.width, `${address} ${name}`).toBeLessThanOrEqual(width);
      }
      // The Scan box's short hint fits whole inside its field (3.8, 12.12).
      const hint = await page.evaluate((onHome) => {
        const input = document.querySelector<HTMLInputElement>(onHome ? "#hp-repo" : ".scan-form input") as HTMLInputElement;
        const style = getComputedStyle(input);
        const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return { text: input.placeholder, need: ctx.measureText(input.placeholder).width, room: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
      }, address === "/");
      console.log(`hint ${String(width)} px ${address}: "${hint.text}" needs ${hint.need.toFixed(0)} px of ${String(hint.room)} px`);
      expect(hint.text).toBe("owner/name");
      expect(hint.need, `${address} hint`).toBeLessThanOrEqual(hint.room);
      const b = await bar(page);
      console.log(`top bar ${String(width)} px ${address}: bar ${String(b.height)} px, tabs ${b.tabs.join(" ")}, field ${b.field === null ? "none" : String(Math.round(b.field))} px`);
      await noSideScroll(page, width);
    }
    await page.locator("header.site-header").getByRole("link", { name: "Overview", exact: true }).focus();
    await page.keyboard.press("Enter");
    await onHomePage(page);
    expect(g.foreign).toEqual([]);
  });
}
