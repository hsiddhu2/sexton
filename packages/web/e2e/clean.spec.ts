// Spec clean-site, task 12.1 (requirements 16.1, 16.2, 16.8 to 16.11, 16.13, 16.14, with the flows of the design the
// owner approved): every flow of the site in a real browser, at 1440 by 900 and at 390 by 844, each case in a fresh
// browser context (a fresh profile: no stored value, no history). The API is routed in the page, so no request leaves
// the local server. During every flow the page is sampled for:
// - at most one View owner and at most one Pop-over (17.1);
// - no visible DOM element over a grave's Art box but the allowed ones (3.15), on Home in every case that shows it;
// - no request outside the page origin and the API base (16.13);
// - no AudioContext and no audio element while Music is not pressed (4.3, 14.7).
// Task 13.4 adds the mischief of requirement 19: the Epitaph line, the Dry lines, the Scanning line and the still Guide
// ghost in the Welcome bar and the Tour card, none of them over a grave.
// Axe runs on every view (16.9), and the Scene repaints 300 graves within the frame budget (16.2).
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, expect, test, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test";
import { BUDGET_MS } from "./budget.js";
import { scan300, SCAN_300_COUNT, SCAN_300_PATH } from "./scan-300.js";

test.skip(!existsSync(chromium.executablePath()), "chromium is not installed");
// A step that waits names itself in the failure rather than running out the case's whole time.
test.use({ actionTimeout: 10_000, navigationTimeout: 10_000 });

const AXE_PATH = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
/** The e2e build's API base (package.json, pretest:e2e): a path on the page origin. */
const API = "/api";
const DEMO_REPO_URL = ["https://github.com", "hsiddhu2", "sexton-demo"].join("/");

interface Size {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** True under 700 px: the Narrow layout. */
  readonly narrow: boolean;
}

const SIZES: readonly Size[] = [
  { name: "1440 by 900", width: 1440, height: 900, narrow: false },
  { name: "390 by 844", width: 390, height: 844, narrow: true },
];

interface DemoScan {
  report: { scan?: { repo: { url: string } }; packages: { name: string; state: string }[] };
  remediations: { packageName: string; status: string }[];
  timelines?: unknown;
}

/** The demo scan, read once from the local server (not from the generated file on disk). */
let DEMO: DemoScan = { report: { packages: [] }, remediations: [] };

test.beforeAll(async ({ playwright }, info) => {
  const api = await playwright.request.newContext({ baseURL: info.project.use.baseURL ?? "http://localhost:4173" });
  DEMO = (await (await api.get("/demo/scan.json")).json()) as DemoScan;
  await api.dispose();
});

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Probe {
  /** The most View owners and Pop-overs seen at once, and what was open then. */
  owners: number;
  popovers: number;
  seen: string[];
  audioContexts: number;
  audioElements: number;
}

declare global {
  interface Window {
    __cleanProbe?: Probe;
    __sextonTiming?: { artBoxes(): Rect[]; redraw(n: number): number[] };
  }
}

/**
 * Runs in the page before any script of the site. It counts the View owners and Pop-overs after every DOM change and
 * every frame, and counts every AudioContext and audio element made. Plain browser code: it is serialised.
 */
function probeScript(): void {
  const probe: Probe = { owners: 0, popovers: 0, seen: [], audioContexts: 0, audioElements: 0 };
  window.__cleanProbe = probe;
  const w = window as unknown as Record<string, unknown>;
  for (const key of ["AudioContext", "webkitAudioContext", "OfflineAudioContext"]) {
    const original = w[key];
    if (typeof original !== "function") continue;
    w[key] = new Proxy(original, {
      construct(target, args, next) {
        probe.audioContexts += 1;
        return Reflect.construct(target, args, next) as object;
      },
    });
  }
  const audio = w["Audio"];
  if (typeof audio === "function")
    w["Audio"] = new Proxy(audio, {
      construct(target, args, next) {
        probe.audioElements += 1;
        return Reflect.construct(target, args, next) as object;
      },
    });
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function (this: Document, name: string, options?: ElementCreationOptions) {
    if (String(name).toLowerCase() === "audio") probe.audioElements += 1;
    return create.call(this, name, options);
  } as typeof Document.prototype.createElement;
  const count = (): void => {
    const owners: [string, string][] = [
      ["drawer", "section.drawer"],
      ["replay", ".replay-view"],
      ["guide", "main.guide"],
      ["tour", ".tour"],
    ];
    const popovers: [string, string][] = [
      ["examples", ".examples.pop"],
      ["legend", "#legend-panel:not([hidden])"],
      ["attacks", "#attack-pop"],
      ["term", ".term-pop"],
    ];
    const open = (list: [string, string][]): string[] => list.flatMap(([name, sel]) => Array.from(document.querySelectorAll(sel), () => name));
    const o = open(owners);
    const p = open(popovers);
    if (o.length > probe.owners || p.length > probe.popovers) probe.seen.push([...o, ...p].join("+"));
    probe.owners = Math.max(probe.owners, o.length);
    probe.popovers = Math.max(probe.popovers, p.length);
    if (document.querySelector("audio") !== null) probe.audioElements = Math.max(probe.audioElements, 1);
  };
  new MutationObserver(count).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
  const frame = (): void => {
    count();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

type ApiHandler = (route: Route, url: URL) => Promise<void> | void;

interface Guard {
  /** Every request the page made, as full URLs. */
  readonly requests: string[];
  /** The requests sent to the API base, as path and query. */
  readonly api: string[];
}

/**
 * Routes every request: another origin is aborted (and recorded, so the check below fails), a path under the API base
 * goes to `onApi` (by default a 500 with no body), anything else is served by the local server.
 */
async function guard(page: Page, origin: string, onApi?: ApiHandler): Promise<Guard> {
  const requests: string[] = [];
  const api: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith(`${API}/`)) {
      api.push(`${url.pathname}${url.search}`);
      if (onApi !== undefined) return onApi(route, url);
      return route.fulfill({ status: 500, body: "" });
    }
    return route.continue();
  });
  return { requests, api };
}

/** A fresh context at one size, with the probe installed: a fresh profile for one case. */
async function freshPage(context: BrowserContext, size: Size): Promise<Page> {
  await context.addInitScript(probeScript);
  const page = await context.newPage();
  await page.setViewportSize({ width: size.width, height: size.height });
  return page;
}

/** The checks that hold through every flow: one owner, one Pop-over, no audio, no request off the origin and API. */
async function checkProbe(page: Page, origin: string, g: Guard): Promise<void> {
  const probe = await page.evaluate(() => window.__cleanProbe);
  expect(probe, "the probe ran").toBeDefined();
  expect(probe?.owners, `View owners at once: ${String(probe?.seen.join(", "))}`).toBeLessThanOrEqual(1);
  expect(probe?.popovers, `Pop-overs at once: ${String(probe?.seen.join(", "))}`).toBeLessThanOrEqual(1);
  expect(probe?.audioContexts, "AudioContexts made").toBe(0);
  expect(probe?.audioElements, "audio elements made").toBe(0);
  const outside = g.requests.filter((u) => new URL(u).origin !== origin);
  expect(outside, "requests outside the page origin").toEqual([]);
  for (const path of g.api) expect(path, "an API request").toMatch(/^\/api\/(scan\?repo=https%3A%2F%2Fgithub\.com%2F|remediate$)/);
}

/** Waits until the canvas holds a painted pixel and the timing hook is in. */
async function scenePainted(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.scene-canvas");
    const data = canvas?.getContext("2d")?.getImageData(2, 2, 1, 1).data;
    return data !== undefined && data[3] === 255 && window.__sextonTiming !== undefined;
  });
}

/**
 * Requirement 3.15: the visible elements above the canvas at points of every grave's Art box, other than the allowed
 * ones. Every element takes pointer events for the sampling (the help line and the badge do not), and an element
 * counts as visible when it paints a background, a border, a shadow or text of its own. Points outside the viewport
 * or the canvas are skipped; the page is sampled at its current scroll.
 */
async function coverings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.scene-canvas");
    const boxes = window.__sextonTiming?.artBoxes() ?? [];
    if (canvas === null) return [];
    const allowed = [
      ".grave-button", // the grave's own transparent button and its focus outline
      ".scanning", // the scanning card (1.14)
      ".scene-card-overlay", // the failure cards (12.1)
      ".backdrop", // the Drawer scrim
      ".drawer",
      ".tour", // the Tour dimming, card and spotlight
      ".pop", // the example list, the Legend, the attack picker
      ".term-pop",
      // The sticky header, only while the page scrolls under it.
      ...(window.scrollY > 0 ? [".site-header"] : []),
    ].join(",");
    const all = Array.from(document.querySelectorAll<HTMLElement | SVGElement>("body *"));
    const saved = all.map((el) => el.style.pointerEvents);
    for (const el of all) el.style.pointerEvents = "auto";
    const visible = (el: Element): boolean => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.opacity === "0") return false;
      const clear = (c: string): boolean => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
      if (!clear(s.backgroundColor) || s.backgroundImage !== "none" || s.boxShadow !== "none") return true;
      if ((["Top", "Right", "Bottom", "Left"] as const).some((side) => parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && !clear(s.getPropertyValue(`border-${side.toLowerCase()}-color`)))) return true;
      if (el instanceof SVGElement || el instanceof HTMLImageElement || el instanceof HTMLCanvasElement) return true;
      return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
    };
    const c = canvas.getBoundingClientRect();
    const found = new Set<string>();
    try {
      for (const b of boxes)
        for (let i = 0; i <= 6; i += 1)
          for (let j = 0; j <= 6; j += 1) {
            const x = c.left + b.x + (b.w * i) / 6;
            const y = c.top + b.y + (b.h * j) / 6;
            if (x < Math.max(c.left, 0) || y < Math.max(c.top, 0) || x >= Math.min(c.right, innerWidth) || y >= Math.min(c.bottom, innerHeight)) continue;
            const stack = document.elementsFromPoint(x, y);
            const k = stack.indexOf(canvas);
            for (const el of stack.slice(0, k < 0 ? 0 : k)) {
              if (el.closest(allowed) !== null || !visible(el)) continue;
              found.add(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class"))} at ${String(Math.round(x))},${String(Math.round(y))}`);
            }
          }
    } finally {
      all.forEach((el, i) => {
        el.style.pointerEvents = saved[i] ?? "";
      });
    }
    return [...found];
  });
}

/**
 * Requirements 19.5 to 19.9: one Guide ghost inside `root`, hidden from assistive technology, taking no input and with
 * no tab stop, never in the Scene, and still: its pixels are the same after a second, under any motion setting.
 */
async function expectStillGhost(page: Page, root: Locator): Promise<void> {
  const ghost = root.locator("canvas.ghost-picture");
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveAttribute("aria-hidden", "true");
  expect(await ghost.getAttribute("tabindex")).toBeNull();
  expect(await ghost.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  const box = await ghost.boundingBox();
  expect([box?.width, box?.height]).toEqual([28, 28]);
  await expect(page.locator(".scene-card canvas.ghost-picture")).toHaveCount(0);
  const first = await ghost.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(1000);
  expect(await ghost.evaluate((el) => (el as HTMLCanvasElement).toDataURL())).toBe(first);
}

/** Requirement 3.15 over the whole Scene: at a phone size the page scrolls, so each screenful of the Scene is sampled. */
async function expectGravesClear(page: Page): Promise<void> {
  await scenePainted(page);
  const top = await page.evaluate(() => window.scrollY);
  const scene = await page.locator("canvas.scene-canvas").boundingBox();
  const vh = page.viewportSize()?.height ?? 900;
  const found: string[] = [];
  if (scene === null || scene.height <= vh - Math.max(scene.y, 0)) found.push(...(await coverings(page)));
  else {
    for (let y = scene.y + top - 100; y < scene.y + top + scene.height; y += vh - 160) {
      await page.evaluate((to) => window.scrollTo(0, to), Math.max(0, y));
      found.push(...(await coverings(page)));
    }
    await page.evaluate((to) => window.scrollTo(0, to), top);
  }
  expect(found, "visible elements over a grave's Art box").toEqual([]);
}

/** Requirement 15.5 at the phone size: nothing scrolls sideways. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "sideways scroll in px").toBeLessThanOrEqual(0);
}

/** A rectangle inside the viewport. */
async function expectInViewport(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  if (box === null || vp === null) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
}

/** An element's box in page coordinates, so a scroll of the page does not count as a move. */
async function pageBox(page: Page, selector: string): Promise<Rect | null> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  });
}

function grave(page: Page, name: string) {
  return page.locator(`button.grave-button[aria-label^="${name} "]`);
}

/** The demo scan as a hosted response, optionally with the remediate action. */
function demoBody(remediate = false): string {
  return JSON.stringify(remediate ? { ...DEMO, actions: { remediate: true } } : DEMO);
}

/** Presses outside every Pop-over at a point that holds no control: the page's left gutter at the viewport's foot. */
async function pressOutside(page: Page): Promise<void> {
  await page.mouse.click(2, (page.viewportSize()?.height ?? 900) - 2);
}

for (const size of SIZES) {
  test.describe(`at ${size.name}`, () => {
    test("the header, the example list, a refused input and the scanning card", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      let release: () => void = () => undefined;
      const held = new Promise<void>((done) => {
        release = done;
      });
      const g = await guard(page, origin, async (route, url) => {
        if (url.pathname === "/api/scan") {
          await held;
          return route.fulfill({ status: 200, contentType: "application/json", body: demoBody() });
        }
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);

      // 1.1: the wordmark, the scan tag, the Scan field and the buttons, in order; 1.4: the tag hides under 1300 px.
      const header = page.locator("header.site-header");
      const order = await header.evaluate((h) =>
        Array.from(h.querySelectorAll(".wordmark, a, .scan-tag, input, .scan-button, .header-buttons button")).map((el) => el.getAttribute("aria-label") ?? (el as HTMLElement).innerText.trim()),
      );
      const tagShown = await page.locator(".scan-tag").isVisible();
      expect(tagShown).toBe(size.width >= 1300);
      expect(order.filter((x) => x !== "")).toEqual(expect.arrayContaining(["GitHub repository to scan", "Scan"]));
      const names = await header.locator(".header-buttons > button, .header-buttons .legend-toggle").evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.trim() || el.getAttribute("aria-label")));
      expect(names.length).toBeGreaterThanOrEqual(3);
      await expect(page.getByRole("button", { name: "What is Sexton?" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Legend" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Tour" })).toBeVisible();
      // 1.15 and 14.2: a track is set, so the Music button shows, off; no audio element exists until it is pressed.
      await expect(page.getByRole("button", { name: "Music" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Music" })).toHaveAttribute("aria-pressed", "false");
      if (size.width >= 1300) await expect(page.locator(".scan-tag")).toHaveText("Sample scan");
      // 1.2 at the wide size: one row of at most 64 px. 15.1 at the phone size: the Scan field on its own row.
      const headerBox = await header.boundingBox();
      const fieldBox = await page.getByLabel("GitHub repository to scan").boundingBox();
      const wordBox = await page.locator(".wordmark").first().boundingBox();
      if (!size.narrow) expect(headerBox?.height ?? 999).toBeLessThanOrEqual(64);
      else expect(fieldBox?.y ?? 0).toBeGreaterThan((wordBox?.y ?? 0) + (wordBox?.height ?? 0) - 1);
      // 1.7: the Fixture name is never on the page.
      await expect(page.locator("body")).not.toContainText("sexton-demo/fixture");

      // 1.9: the example list on focus, headed "Try one", three entries in order.
      const field = page.getByLabel("GitHub repository to scan");
      await field.focus();
      const examples = page.locator(".examples.pop");
      await expect(examples).toBeVisible();
      await expect(examples.locator(".pop-heading")).toHaveText("Try one");
      await expect(examples.locator(".example")).toHaveText([
        "hsiddhu2/sexton-demopull requests work here",
        "expressjs/expressa popular web framework",
        "facebook/reacta large repo",
      ]);
      if (size.narrow) await expectNoSidewaysScroll(page);
      await expectGravesClear(page);
      // 13.12: a press outside closes it.
      await pressOutside(page);
      await expect(examples).toHaveCount(0);

      // 1.12: a refused input marks the field, keeps focus in it, sends nothing and says why.
      await field.fill("not a repository!");
      await field.press("Enter");
      await expect(page.getByRole("alert")).toHaveText("Enter a repo as owner/name, or paste a github.com link.");
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(field).toBeFocused();
      expect(g.api).toEqual([]);

      // 1.10 and 1.14: an example starts a Live scan; the scanning card shows while it loads, with no progress bar.
      await field.fill("");
      await field.focus();
      await examples.locator(".example").first().click();
      const card = page.locator(".scanning");
      await expect(card).toBeVisible();
      await expect(card.locator(".scanning-title")).toHaveText("Digging through hsiddhu2/sexton-demo");
      await expect(card).toContainText("This usually takes a few seconds.");
      // 19.8: the Scanning line, one more line under the note in the same card.
      await expect(card.locator(".scanning-note + .scanning-mischief")).toHaveText("Lantern lit. Mind the roots.");
      await expect(card.locator(".scanning-lines li")).toHaveText(["Reading package.json and the lockfile", "Asking npm, OSV and deps.dev", "Reading each headstone"]);
      await expect(page.getByRole("progressbar")).toHaveCount(0);
      await expect(field).toHaveValue("hsiddhu2/sexton-demo");
      // Review against the approved design: the card sits over the dimmed Scene of the scan shown before, whose headline,
      // chips, Panel and footers stay; the tag keeps "Sample scan" until the new scan is in (D6).
      await expect(page.locator(".scene-veil .scanning")).toBeVisible();
      await expect(page.locator("h1.headline")).toHaveText("1 of 12 dependencies needs you now.");
      await expect(page.locator(".chip")).toHaveCount(5);
      await expect(page.locator(".panel .inspector")).toHaveCount(1);
      await expect(page.locator(".foot-bar")).toHaveCount(1);
      if (size.width >= 1300) await expect(page.locator(".scan-tag")).toHaveText("Sample scan");
      release();
      await expect(card).toHaveCount(0);
      // 1.6 and 10.5: the Live scan names its repository in the tag and the address.
      if (size.width >= 1300) await expect(page.locator(".scan-tag")).toHaveText("hsiddhu2/sexton-demo");
      expect(new URL(page.url()).searchParams.get("repo")).toBe(DEMO_REPO_URL);
      expect(g.api).toEqual([`/api/scan?repo=${encodeURIComponent(DEMO_REPO_URL)}`]);
      await expect(grave(page, "left-padder")).toHaveCount(1);
      await expectGravesClear(page);
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("Home: hover and the Inspector, the chips, the Fix order, the keys and the List", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);
      await scenePainted(page);

      // 2.1 and 2.4: the headline counts the Possessed packages; one chip per State, in order, with its count.
      await expect(page.locator(".headline")).toHaveText("1 of 12 dependencies needs you now.");
      await expect(page.locator(".chips .chip")).toHaveText([/^Possessed 1$/, /^Dead 5$/, /^Haunted 1$/, /^Restless 3$/, /^Alive 2$/]);
      // 2.10: the help line in the Wide and Middle layouts only.
      await expect(page.locator(".scene-help")).toBeVisible({ visible: !size.narrow });
      if (!size.narrow) await expect(page.locator(".scene-help")).toHaveText("Point at a grave to see its details on the right. Click it to open.");
      await expectGravesClear(page);

      // 3.3 to 3.5: at rest the Inspector shows the Selected grave; on hover it shows the hovered one, the Panel stays.
      const inspector = page.locator(".inspector");
      await expect(inspector.locator(".eyebrow")).toHaveText(/You are looking at\s*Selected/i);
      await expect(inspector.locator(".inspector-name")).toHaveText("left-padder");
      // 19.1: the Epitaph line of the Reason family, under the name, as plain text in the muted colour, not italic.
      const epitaph = inspector.locator(".inspector-name + .inspector-epitaph");
      await expect(epitaph).toHaveText("The keys changed hands. Nobody heard the door.");
      await expect(epitaph.locator("*")).toHaveCount(0);
      expect(await epitaph.evaluate((el) => [getComputedStyle(el).fontStyle, getComputedStyle(el).fontFamily.split(",")[0]])).toEqual(["normal", "Inter"]);
      const panelBefore = await pageBox(page, ".panel");
      await grave(page, "lodash").hover();
      await expect(inspector.locator(".inspector-name")).toHaveText("lodash");
      await expect(inspector.locator(".eyebrow-mark")).toHaveCount(0);
      await expect(epitaph).toHaveText("Something serious walks these grounds.");
      // 3.6: lodash has a Proposed plan.
      await expect(inspector.getByRole("button", { name: "See the evidence and the fix" })).toBeVisible();
      const panelAfter = await pageBox(page, ".panel");
      // The Panel keeps its place and width; its height follows the shown grave's card.
      expect({ ...panelAfter, h: 0 }).toEqual({ ...panelBefore, h: 0 });
      await expectGravesClear(page);
      await grave(page, "express").hover();
      await expect(inspector.locator(".inspector-name")).toHaveText("express");
      // 3.7: express has none.
      await expect(inspector.getByRole("button", { name: "See the evidence", exact: true })).toBeVisible();
      await page.mouse.move(2, (page.viewportSize()?.height ?? 900) - 2);
      await expect(inspector.locator(".inspector-name")).toHaveText("left-padder");
      // 11.2, 11.4 on Home: a Term in the Inspector opens its meaning inside the viewport.
      await inspector.locator(".term").first().click();
      await expect(page.locator(".term-pop")).toBeVisible();
      await expectInViewport(page, ".term-pop");
      await expectGravesClear(page);
      await pressOutside(page);
      await expect(page.locator(".term-pop")).toHaveCount(0);

      // 3.18 and 3.20: the Fix order, worst first, the current row marked.
      const rows = page.locator(".fix-order .fix-row");
      await expect(rows).toHaveCount(5);
      await expect(rows.locator(".fix-name")).toHaveText([/left-padder/, /event-stream/, /uuid/, /request/, /left-pad$/]);
      await expect(rows.first()).toHaveClass(/fix-row-current/);
      await expect(rows.first().locator(".fix-line")).toHaveText("review the maintainer change");
      // 3.21: a row press selects and opens nothing.
      await rows.nth(1).click();
      await expect(inspector.locator(".inspector-name")).toHaveText("event-stream");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // 3.23: Right moves the Selected grave in triage order from the body.
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      await page.keyboard.press("ArrowRight");
      await expect(inspector.locator(".inspector-name")).toHaveText("uuid");
      await page.keyboard.press("ArrowLeft");
      await expect(inspector.locator(".inspector-name")).toHaveText("event-stream");
      // 3.24: Enter on the body opens the Selected grave's Drawer.
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toContainText("event-stream");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // 2.5 to 2.8: a chip filters; only it is pressed; the other States' graves leave the tab order.
      const dead = page.locator(".chips .chip-dead");
      await dead.click();
      await expect(dead).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('.chips .chip[aria-pressed="true"]')).toHaveCount(1);
      await expect(grave(page, "lodash")).toHaveAttribute("tabindex", "-1");
      expect(await page.locator('button.grave-button[tabindex="0"]').count()).toBe(1);
      const stop = await page.locator('button.grave-button[tabindex="0"]').getAttribute("aria-label");
      expect(stop).toMatch(/Dead/);
      await expectGravesClear(page);
      // 16.14: the arrow keys still reach every grave under a filter.
      await page.locator('button.grave-button[tabindex="0"]').focus();
      const focused = (): Promise<string> => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
      const seen = new Set<string>([await focused()]);
      for (let i = 1; i < 12; i += 1) {
        const before = await focused();
        await page.keyboard.press("ArrowRight");
        await expect.poll(focused).not.toBe(before);
        seen.add(await focused());
      }
      expect(seen.size).toBe(12);
      await dead.click();
      await expect(dead).toHaveAttribute("aria-pressed", "false");
      // 16.8: with no filter every grave is reachable by Tab (one roving stop, the arrows reach the rest).
      expect(await page.locator('button.grave-button[tabindex="0"]').count()).toBe(1);

      // 6.1 to 6.10, 6.15: the List, its Find box, its sorts, the chip filter, the empty row and a row press.
      await page.getByRole("button", { name: "List", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("view")).toBe("list");
      const table = page.locator("table.list-table");
      await expect(table).toBeVisible();
      await expect(table.locator("thead th")).toHaveText([/^Package/, /^Version/, /^State/, /^Why/, /^Fix/]);
      await expect(table.locator("tbody .list-open")).toHaveCount(12);
      await expect(table.locator("tbody .list-open").first()).toHaveText("left-padder");
      await expect(table.locator('th[aria-sort="ascending"]')).toHaveText(/^State/);
      await table.getByRole("button", { name: /^Package/ }).click();
      await expect(table.locator('th[aria-sort="ascending"]')).toHaveText(/^Package/);
      await expect(table.locator("tbody .list-open").first()).toHaveText("colors");
      await page.getByRole("searchbox", { name: "Find a package" }).fill(" LEFT ");
      await expect(table.locator("tbody .list-open")).toHaveText(["left-pad", "left-padder"]);
      await page.getByRole("searchbox", { name: "Find a package" }).fill("nothing-like-this");
      await expect(table.locator("tbody tr")).toHaveText(["No package matches."]);
      await page.getByRole("searchbox", { name: "Find a package" }).fill("");
      await page.locator(".chips .chip-haunted").click();
      await expect(table.locator("tbody .list-open")).toHaveText(["lodash"]);
      await page.locator(".chips .chip-haunted").click();
      // 6.13: the Panel shows the Looked-at grave beside the List.
      await expect(page.locator(".inspector")).toBeVisible();
      await table.locator("tbody tr", { hasText: "uuid" }).click();
      await expect(page.getByRole("dialog")).toContainText("uuid");
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await table.getByRole("button", { name: "request", exact: true }).press("Enter");
      await expect(page.getByRole("dialog")).toContainText("request");
      await page.keyboard.press("Escape");
      await expect(table.getByRole("button", { name: "request", exact: true })).toBeFocused();
      if (size.narrow) await expectNoSidewaysScroll(page);
      await page.getByRole("button", { name: "Graveyard" }).click();
      await expect(table).toHaveCount(0);
      await expect(grave(page, "left-padder")).toHaveCount(1);
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("the Drawer: its tabs, a Term, the copy buttons and the way it closes", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      await page.goto("/");
      await expect(grave(page, "event-stream")).toHaveCount(1);
      await scenePainted(page);

      // 3.16 and 7.1: a grave click opens the Drawer with its breadcrumb, badge, tabs and one close button.
      await grave(page, "event-stream").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".crumbs")).toHaveText(/←\s*Cemetery\s*\/\s*event-stream/);
      await expect(dialog.locator("#drawer-title")).toHaveText(/event-stream\s+3\.3\.6/);
      await expect(dialog.locator(".drawer-badge")).toHaveText("Dead");
      await expect(dialog.getByRole("tab")).toHaveText(["Evidence", "The fix", "History"]);
      await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(1);
      // 7.21: focus starts on the close button; 7.19: the scan date shows.
      await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
      await expect(dialog.locator(".drawer-scan-date")).toContainText("Scan of 12 Nov 2026");
      expect(new URL(page.url()).searchParams.get("grave")).toBe("event-stream");
      // 15.4: full width on a phone.
      if (size.narrow) {
        const box = await dialog.boundingBox();
        expect(box?.width ?? 0).toBeCloseTo(size.width, 1);
        await expectNoSidewaysScroll(page);
      }
      await expectGravesClear(page);

      // 7.2 and 16.10: the Evidence tab, every signal with its label, value, source and fetch time.
      await expect(dialog.locator(".verdict")).toHaveText(/^Dead\./);
      const signalRows = dialog.locator("table.drawer-signals tbody tr");
      expect(await signalRows.count()).toBeGreaterThan(4);
      await expect(dialog.locator("table.drawer-signals a").first()).toHaveAttribute("href", /^https:\/\//);
      // 11.2 to 11.5: a Term in a signal label opens its meaning beside it, inside the viewport; outside closes it.
      const term = dialog.locator(".term").first();
      await term.click();
      const pop = page.locator(".term-pop");
      await expect(pop).toBeVisible();
      await expectInViewport(page, ".term-pop");
      await dialog.locator("#drawer-title").click();
      await expect(pop).toHaveCount(0);
      // 10.3: Escape closes the Term first, then the Drawer.
      await term.click();
      await expect(pop).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(pop).toHaveCount(0);
      await expect(dialog).toBeVisible();

      // 7.3, 7.5, 7.11 and 7.16: the fix tab of a Proposed plan: the diff, one copy button, the closed disclosure.
      await dialog.getByRole("tab", { name: "The fix" }).click();
      await expect(dialog.getByRole("group", { name: "package.json change" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /^Copy/ })).toHaveText(["Copy pull request text"]);
      await expect(dialog.getByRole("button", { name: "Open pull request" })).toHaveCount(0);
      await expect(dialog.locator(".drawer-note")).toContainText("No sign-in needed. Open pull request works on a live scan of hsiddhu2/sexton-demo.");
      const disclosure = dialog.locator("details.pr-disclosure");
      await expect(disclosure).not.toHaveAttribute("open", "");
      await dialog.getByRole("button", { name: "Copy pull request text" }).click();
      await expect(dialog.locator(".drawer-copy-status")).toHaveText("Copied. Paste it into a pull request or an issue on your repo.");
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied.length).toBeGreaterThan(40);
      await disclosure.locator("summary").click();
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(disclosure.locator("summary")).toHaveText("Read the pull request text");
      // 7.17: the History tab, newest first.
      await dialog.getByRole("tab", { name: "History" }).click();
      const history = dialog.locator("ol.history li");
      expect(await history.count()).toBeGreaterThan(1);
      await expect(history.first()).toContainText("Dead");
      // 10.16: a tab change leaves the address alone.
      expect(new URL(page.url()).searchParams.get("grave")).toBe("event-stream");

      // 7.25 and 7.22: the close button closes it and focus returns to the grave.
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(grave(page, "event-stream")).toBeFocused();
      expect(new URL(page.url()).searchParams.get("grave")).toBeNull();

      // 7.6: a Possessed package with no Proposed plan: "Copy this as an issue" and the maintainer note (7.7).
      await grave(page, "left-padder").click();
      await dialog.getByRole("tab", { name: "The fix" }).click();
      await expect(dialog.getByRole("button", { name: /^Copy/ })).toHaveText(["Copy this as an issue"]);
      await expect(dialog.locator(".drawer-note")).toContainText("Check who the new maintainer is before the next install.");
      await dialog.getByRole("button", { name: "Copy this as an issue" }).click();
      await expect(dialog.locator(".drawer-copy-status")).toHaveText("Copied. Paste it into a pull request or an issue on your repo.");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("left-padder");
      // 7.23: the scrim closes it (a press on the scrim beside the sheet; a phone's sheet is full width).
      if (!size.narrow) {
        await page.mouse.click(20, size.height - 20);
        await expect(dialog).toHaveCount(0);
      } else {
        // 10.14: the breadcrumb closes it.
        await dialog.getByRole("button", { name: "← Cemetery" }).click();
        await expect(dialog).toHaveCount(0);
      }

      // 7.9 and 7.10: a Restless and an Alive package: a sentence, the note, no button.
      for (const [name, title] of [
        ["moment", "Nothing urgent"],
        ["express", "Healthy"],
      ] as const) {
        const state = DEMO.report.packages.find((p) => p.name === name)?.state;
        if (state !== (title === "Healthy" ? "Alive" : "Restless")) continue;
        await grave(page, name).click();
        await dialog.getByRole("tab", { name: "The fix" }).click();
        await expect(dialog).toContainText(title);
        await expect(dialog).toContainText("No action needed.");
        await expect(dialog.getByRole("button", { name: /^Copy|Open pull request/ })).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
      }
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("the Drawer on a Live scan with remediate, and a copy the browser blocks", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      // 7.12: the clipboard refuses.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("blocked")) }, configurable: true });
      });
      const page = await freshPage(context, size);
      const g = await guard(page, origin, (route, url) => {
        if (url.pathname === "/api/scan") return route.fulfill({ status: 200, contentType: "application/json", body: demoBody(true) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "opened", prUrl: `${DEMO_REPO_URL}/pull/9`, logged: true }) });
      });
      await page.goto("/");
      const field = page.getByLabel("GitHub repository to scan");
      await field.fill("hsiddhu2/sexton-demo");
      await field.press("Enter");
      await expect(page.locator(".scanning")).toHaveCount(0);
      await grave(page, "event-stream").click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: "The fix" }).click();
      // 7.4 and 7.14: Open pull request on a Live scan with actions.remediate.
      await expect(dialog.locator(".drawer-note")).toContainText("No sign-in needed. This button opens a real pull request on hsiddhu2/sexton-demo.");
      await dialog.getByRole("button", { name: "Copy pull request text" }).click();
      await expect(dialog.locator(".drawer-copy-status")).toHaveText("Copy was blocked by the browser. Select the text and copy it by hand.");
      await dialog.getByRole("button", { name: "Open pull request" }).click();
      await expect(dialog.getByRole("link", { name: "View the pull request on GitHub" })).toHaveAttribute("href", `${DEMO_REPO_URL}/pull/9`);
      expect(g.api).toEqual([`/api/scan?repo=${encodeURIComponent(DEMO_REPO_URL)}`, "/api/remediate"]);
      // The way the Drawer offers no sign-in (7.20).
      await expect(page.getByText(/sign in with github/i)).toHaveCount(0);
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("the Legend, the scrubber and the attack picker", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);
      await scenePainted(page);

      // 13.1, 13.2: the Legend opens under its button, eight entries and the fix order line, and nothing moves.
      // The Scene card settles its height once the fonts and the Footer bar are measured; take it after that.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // Settled means the same box on two samples 400 ms apart; the first sample only starts the count.
      let sceneBefore: Rect | null | undefined = undefined;
      await expect
        .poll(async () => {
          const now = await pageBox(page, ".scene-card");
          const same = sceneBefore !== undefined && JSON.stringify(now) === JSON.stringify(sceneBefore);
          sceneBefore = now;
          return same;
        }, { intervals: [400, 400, 400, 400, 400, 400, 400, 400] })
        .toBe(true);
      const legendButton = page.getByRole("button", { name: "Legend" });
      await legendButton.click();
      const legend = page.locator("#legend-panel");
      await expect(legend).toBeVisible();
      await expect(legend.locator(".pop-heading")).toHaveText("What each grave means");
      await expect(legend.locator(".legend-chip")).toHaveCount(8);
      await expect(legend).toContainText("one or more advisories");
      await expect(legend).toContainText("a pull request was opened");
      await expect(legend).toContainText("not published yet on the chosen date");
      await expect(legend.locator(".legend-triage")).toHaveText("Fix order: Possessed first, then Dead, Haunted, Restless. Then by advisory severity and reach.");
      expect(await pageBox(page, ".scene-card")).toEqual(sceneBefore);
      const legendBox = await legend.boundingBox();
      const buttonBox = await legendButton.boundingBox();
      expect(legendBox?.y ?? 0).toBeGreaterThanOrEqual((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0) - 1);
      await expectInViewport(page, "#legend-panel");
      if (size.narrow) await expectNoSidewaysScroll(page);
      await expectGravesClear(page);
      // 13.11: a second press closes it; 13.12: so does a press outside.
      await legendButton.click();
      await expect(legend).toBeHidden();
      await legendButton.click();
      await expect(legend).toBeVisible();
      await pressOutside(page);
      await expect(legend).toBeHidden();

      // 16.3, 2.3, 2.11, 10.8: the scrubber to its first date replaces the entry and shows that date.
      const slider = page.getByRole("slider", { name: "History date" });
      await expect(slider).toHaveAttribute("aria-valuetext", /12 Nov 2026/);
      await expect(page.locator(".scrub-ends")).toContainText("Today, 12 Nov 2026");
      const entries = await page.evaluate(() => history.length);
      await slider.focus();
      await slider.press("Home");
      await slider.press("ArrowRight");
      await expect(page.locator(".headline")).toHaveText(/(needed you on|Nothing needed you on) \d{1,2} \w{3} \d{4}\.$/);
      await expect(page.locator(".date-badge")).toHaveText(/^Viewing \d{1,2} \w{3} \d{4}$/);
      await expect(page.locator(".scene-help")).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("at")).not.toBeNull();
      expect(await page.evaluate(() => history.length)).toBe(entries);
      await expect(page.locator(".inspector-why")).toHaveText(/^(On \d{1,2} \w{3} \d{4} this package was \w+\.|The installed version did not exist yet\.)$/);
      // 19.2: no Epitaph line at an earlier date.
      await expect(page.locator(".inspector-epitaph")).toHaveCount(0);
      await expectGravesClear(page);
      // 16.4, 16.15: Back to now.
      await page.getByRole("button", { name: "Back to now" }).click();
      await expect(page.locator(".headline")).toHaveText("1 of 12 dependencies needs you now.");
      await expect(page.locator(".date-badge")).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("at")).toBeNull();

      // 16.7, 16.16: the attack picker with its heading, its line and one button per Replay; a second press closes it.
      const watch = page.getByRole("button", { name: "Watch a real attack" });
      await watch.click();
      const picker = page.locator("#attack-pop");
      await expect(picker).toBeVisible();
      await expect(picker.locator(".pop-heading")).toHaveText("Two real npm attacks from 2026");
      await expect(picker.locator(".pop-line")).toHaveText("A trusted package was taken over and a bad version was published. See how each one would have looked in your cemetery.");
      await expect(picker.locator(".attack")).toHaveText([/^axios.*3 steps\.$/, /^keyv.*2 steps\.$/]);
      await expectInViewport(page, "#attack-pop");
      await expectGravesClear(page);
      // 17.3: opening the Legend closes the picker.
      await legendButton.click();
      await expect(picker).toHaveCount(0);
      await expect(legend).toBeVisible();
      await legendButton.click();
      await watch.click();
      await expect(picker).toBeVisible();
      await watch.click();
      await expect(picker).toHaveCount(0);
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("both Replays through every Step", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);

      // 8.1, 8.2: the axios Replay from the attack picker, at Step 1, in place of Home.
      const entries = await page.evaluate(() => history.length);
      await page.getByRole("button", { name: "Watch a real attack" }).click();
      await page.locator("#attack-pop .attack", { hasText: "axios" }).click();
      expect(new URL(page.url()).search).toBe("?replay=axios");
      expect(await page.evaluate(() => history.length)).toBe(entries + 1);
      await expect(page.locator(".crumbs")).toHaveText(/←\s*Cemetery\s*\/\s*Real attacks\s*\/\s*axios/);
      await expect(page.locator(".headline")).toHaveText("Watch the axios attack unfold");
      await expect(page.locator(".hero-line")).toHaveText("31 March 2026. A real attack on one package, step by step. Watch the grave change.");
      if (size.width >= 1300) await expect(page.locator(".scan-tag")).toHaveText("Replay");
      await expect(page.locator(".chips")).toHaveCount(0);
      const panel = page.locator(".step-panel");
      const back = panel.getByRole("button", { name: "Back", exact: true });
      await expect(panel.locator("#step-heading")).toContainText("Step 1 of 3");
      await expect(back).toBeDisabled();
      await expect(panel.locator(".inspector-badge")).toHaveText("axios 1.14.0 is Alive");
      // 8.3: nothing moves by itself.
      await page.waitForTimeout(600);
      await expect(panel.locator("#step-heading")).toContainText("Step 1 of 3");
      // 8.12: the Why card with https sources and the not-live line.
      const why = page.locator(".why-card");
      await expect(why.locator("#why-heading")).toHaveText(/Why attackers do this/i);
      for (const href of await why.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) expect(href).toMatch(/^https:\/\//);
      await expect(why).toContainText("Reconstructed from public reports. Not a live scan.");
      await expect(page.locator(".step-cards .step-card")).toHaveCount(3);
      await scenePainted(page);

      // 8.4, 8.20, 8.13: every Step, each with its own texts and a date badge of its time (8.16).
      const texts = new Set<string>();
      const states = ["Alive", "Possessed", "Alive"];
      for (let k = 1; k <= 3; k += 1) {
        await expect(panel.locator("#step-heading")).toContainText(`Step ${String(k)} of 3`);
        await expect(panel.locator(".inspector-badge")).toHaveText(new RegExp(`^axios 1\\.14\\.\\d is ${states[k - 1] ?? ""}$`));
        await expect(panel.locator(".step-label")).toHaveText(["What happened", "What Sexton shows"]);
        texts.add(((await panel.locator(".step-text").allTextContents()).join("|")));
        await expect(page.locator(".replay-stage .date-badge")).toHaveText(/^\d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC$/);
        await expect(page.locator('.step-card[aria-current="step"]')).toContainText(`Step ${String(k)}`);
        if (k === 2) {
          // 8.19: the Replay's grave opens nothing.
          await page.locator("button.grave-button").first().click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
          // 8.16: the one grave at full size.
          await expect(page.locator("button.grave-button")).toHaveCount(1);
        }
        if (k < 3) await panel.getByRole("button", { name: "Next step" }).click();
      }
      expect(texts.size).toBe(3);
      // 8.5, 8.21, 8.22: the last Step's button, Back and a Step card.
      await expect(panel.getByRole("button", { name: "Next step" })).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "Back to the cemetery" })).toBeVisible();
      await back.click();
      await expect(panel.locator("#step-heading")).toContainText("Step 2 of 3");
      await page.locator(".step-cards .step-card").first().click();
      await expect(panel.locator("#step-heading")).toContainText("Step 1 of 3");
      // 8.9, 8.11: Play all moves on a press and Pause stops it.
      const play = page.getByRole("button", { name: "Play all" });
      await play.click();
      await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
      await expect(panel.locator("#step-heading")).toContainText("Step 2 of 3", { timeout: 7_000 });
      await page.getByRole("button", { name: "Pause" }).click();
      await expect(play).toBeVisible();
      await page.waitForTimeout(600);
      await expect(panel.locator("#step-heading")).toContainText("Step 2 of 3");
      // 11.2 on a Step text: a Term opens its meaning.
      const stepTerm = page.locator(".step-panel .term, .why-card .term").first();
      if ((await stepTerm.count()) > 0) {
        await stepTerm.click();
        await expect(page.locator(".term-pop")).toBeVisible();
        await expectInViewport(page, ".term-pop");
        await page.keyboard.press("Escape");
        await expect(page.locator(".term-pop")).toHaveCount(0);
        await expect(page.locator(".replay-view")).toHaveCount(1);
      }
      if (size.narrow) await expectNoSidewaysScroll(page);
      // 8.6: "Back to the cemetery" from the last Step is the Home action (10.7 adds an entry).
      await page.locator(".step-cards .step-card").nth(2).click();
      await panel.getByRole("button", { name: "Back to the cemetery" }).click();
      await expect(page.locator(".headline")).toHaveText("1 of 12 dependencies needs you now.");
      expect(new URL(page.url()).search).toBe("");

      // The keyv Replay by its address (10.6), through both Steps, then "Exit replay" (8.18).
      await page.goto("/?replay=keyv");
      await expect(page.locator(".headline")).toHaveText("Watch the keyv attack unfold");
      await expect(panel.locator("#step-heading")).toContainText("Step 1 of 2");
      await expect(panel.locator(".inspector-badge")).toHaveText(/^keyv 5\.6\.0 is Alive$/);
      await panel.getByRole("button", { name: "Next step" }).click();
      await expect(panel.locator("#step-heading")).toContainText("Step 2 of 2");
      await expect(panel.locator(".inspector-badge")).toHaveText(/^keyv 6\.0\.0 is Possessed$/);
      await expect(panel.getByRole("button", { name: "Back to the cemetery" })).toBeVisible();
      // 8.10: Play all at the last Step starts again at Step 1.
      await page.getByRole("button", { name: "Play all" }).click();
      await expect(panel.locator("#step-heading")).toContainText("Step 1 of 2");
      await page.getByRole("button", { name: "Exit replay" }).click();
      await expect(page.locator(".headline")).toHaveText("1 of 12 dependencies needs you now.");
      await expect(page.getByRole("button", { name: "Play all" })).toHaveCount(0);
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("the Welcome bar and the Guide page", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);

      // 9.5, 9.9: a fresh profile shows the Welcome bar under the header, in the page flow.
      const bar = page.getByRole("region", { name: "Welcome" });
      await expect(bar).toHaveText(/New here\? Read the two-minute guide first\. It explains what Sexton is and what the graves mean\.\s*Read the guide/);
      const headerBox = await page.locator("header.site-header").boundingBox();
      const barBox = await bar.boundingBox();
      const heroBox = await page.locator(".hero").boundingBox();
      expect(barBox?.y ?? 0).toBeGreaterThanOrEqual((headerBox?.y ?? 0) + (headerBox?.height ?? 0) - 1);
      expect(heroBox?.y ?? 0).toBeGreaterThanOrEqual((barBox?.y ?? 0) + (barBox?.height ?? 0));
      if (size.narrow) await expectNoSidewaysScroll(page);
      // 19.6, 19.7, 19.9: the Guide ghost at the bar's start, before its text: hidden, no input, and still.
      await expectStillGhost(page, bar);
      await expect(bar.locator(".welcome-lead > :first-child")).toHaveClass("ghost-picture");
      await expectGravesClear(page);
      // 9.7: its close button hides it and stores the choice, so a reload keeps it hidden.
      await bar.getByRole("button", { name: "Close the welcome bar" }).click();
      await expect(bar).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("sexton:welcome"))).toBe("closed");
      await page.reload();
      await expect(grave(page, "left-padder")).toHaveCount(1);
      await expect(bar).toHaveCount(0);
      // 9.6, 9.11: in another fresh profile, "Read the guide" opens the Guide page and stores the choice.
      const second = await freshPage(await browser.newContext(), size);
      const g2 = await guard(second, origin);
      await second.goto("/");
      await second.getByRole("region", { name: "Welcome" }).getByRole("button", { name: "Read the guide" }).click();
      await expect(second.locator("main.guide")).toBeVisible();
      await expect(second.getByRole("region", { name: "Welcome" })).toHaveCount(0);
      expect(await second.evaluate(() => localStorage.getItem("sexton:welcome"))).toBe("closed");
      await checkProbe(second, origin, g2);
      await second.context().close();

      // 9.1, 9.2: "What is Sexton?" opens the Guide page with its parts in order.
      await page.getByRole("button", { name: "What is Sexton?" }).click();
      const guide = page.locator("main.guide");
      await expect(guide).toBeVisible();
      expect(new URL(page.url()).search).toBe("?page=guide");
      await expect(guide.locator(".crumbs")).toHaveText(/←\s*Cemetery\s*\/\s*What is Sexton\?/);
      await expect(guide.locator(".eyebrow").first()).toHaveText(/The two-minute guide/i);
      await expect(guide.locator("h1")).toHaveText("Sexton looks after the code your app borrows.");
      await expect(guide.locator("h2.guide-heading")).toHaveText(["The problem, in plain words", "What Sexton does", "What the five graves mean", "Questions people ask"]);
      await expect(guide.locator(".guide-step")).toHaveCount(3);
      await expect(guide.locator(".guide-grave .badge")).toHaveText(["Possessed", "Dead", "Haunted", "Restless", "Alive"]);
      await expect(guide.locator(".guide-qa")).toHaveCount(5);
      await expect(guide.locator(".guide-buttons button")).toHaveText(["Go to the cemetery", "Watch a real attack"]);
      // The Guide page replaces Home: no Scene, no Panel, no site footer.
      await expect(page.locator(".scene-card")).toHaveCount(0);
      await expect(page.locator(".site-footer")).toHaveCount(0);
      await expect(page.locator(".panel")).toHaveCount(0);
      // 11.2 on the Guide page answers: a Term opens its meaning.
      const guideTerm = guide.locator(".guide-answer .term").first();
      await guideTerm.scrollIntoViewIfNeeded();
      await guideTerm.click();
      await expect(page.locator(".term-pop")).toBeVisible();
      await expectInViewport(page, ".term-pop");
      await guide.locator("h1").click();
      await expect(page.locator(".term-pop")).toHaveCount(0);
      if (size.narrow) await expectNoSidewaysScroll(page);
      // 9.3: "Watch a real attack" opens the axios Replay; 9.10: "Go to the cemetery" goes home.
      await guide.getByRole("button", { name: "Watch a real attack" }).click();
      await expect(page.locator(".headline")).toHaveText("Watch the axios attack unfold");
      await page.goBack();
      await expect(guide).toBeVisible();
      await guide.getByRole("button", { name: "Go to the cemetery" }).click();
      await expect(page.locator(".headline")).toHaveText("1 of 12 dependencies needs you now.");
      expect(new URL(page.url()).search).toBe("");
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("the Tour, from the List, through its three steps", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      await page.goto("/?view=list");
      await expect(page.locator("table.list-table")).toBeVisible();
      // 13.8: the Tour starts only when pressed.
      await expect(page.locator(".tour")).toHaveCount(0);

      // 13.3: Tour takes the Home action and switches to the Graveyard view.
      await page.getByRole("button", { name: "Tour" }).click();
      await expect(page.locator("table.list-table")).toHaveCount(0);
      await expect(grave(page, "left-padder")).toHaveCount(1);
      expect(new URL(page.url()).searchParams.get("view")).toBeNull();
      const card = page.locator(".tour-card");
      const steps = [
        ["Every grave is one dependency", "Its shape tells you its health. The worst ones stand in the front row.", "scene"],
        ["One panel, always in the same place", "Hover a grave and its details show here. Nothing floats over the graves.", "inspector"],
        ["Scan your own repo", "Paste a public GitHub repo with a package.json at the top. Sexton reads it and builds its cemetery. No sign-in needed.", "scan"],
      ] as const;
      for (const [i, [title, text, target]] of steps.entries()) {
        // 13.5 to 13.7: the card inside the viewport, its step line and buttons, the dimming and the spotlight.
        await expect(card.locator(".eyebrow")).toHaveText(`Step ${String(i + 1)} of 3`);
        await expect(card.locator(".tour-title")).toHaveText(title);
        // 19.5, 19.7, 19.9: the Guide ghost beside the step title: hidden, no input, and still.
        await expectStillGhost(page, card.locator(".tour-title-row"));
        await expect(card.locator(".tour-title-row > .ghost-picture + .tour-title")).toHaveCount(1);
        await expect(card.locator(".tour-text")).toHaveText(text);
        await expect(card.getByRole("button", { name: "Skip" })).toBeVisible();
        await expect(card.getByRole("button", { name: i === 2 ? "Done" : "Next" })).toBeFocused();
        await expectInViewport(page, ".tour-card");
        await expect(page.locator(".tour-dim")).toHaveCount(4);
        expect(await page.locator(".tour-dim:visible").count()).toBeGreaterThan(0);
        await expect(page.locator(".tour-spot")).toBeVisible();
        // The spotlight sits on the step's target.
        const spot = await page.locator(".tour-spot").boundingBox();
        const aim = await page.locator(`[data-tour="${target}"]`).boundingBox();
        expect(Math.abs((spot?.x ?? 0) + (spot?.width ?? 0) / 2 - ((aim?.x ?? 0) + (aim?.width ?? 0) / 2))).toBeLessThan(40);
        // 13.5: a press outside the card does nothing.
        await page.mouse.click(4, (page.viewportSize()?.height ?? 900) - 4);
        await expect(card).toBeVisible();
        await expect(page.getByRole("dialog", { name: title })).toBeVisible();
        if (i === 0) await expectGravesClear(page);
        if (size.narrow) await expectNoSidewaysScroll(page);
        if (i < 2) await card.getByRole("button", { name: "Next" }).click();
      }
      // 13.10: Done ends it and leaves Home as it was.
      await card.getByRole("button", { name: "Done" }).click();
      await expect(page.locator(".tour")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Tour" })).toBeFocused();
      // Skip and Escape end it too (13.10, 10.3).
      await page.getByRole("button", { name: "Tour" }).click();
      await card.getByRole("button", { name: "Skip" }).click();
      await expect(page.locator(".tour")).toHaveCount(0);
      await page.getByRole("button", { name: "Tour" }).click();
      await expect(card).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".tour")).toHaveCount(0);
      await expect(page.locator(".headline")).toHaveText("1 of 12 dependencies needs you now.");
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("a failed scan, then Try the demo repo and Back to the sample", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      const g = await guard(page, origin, (route, url) => {
        const repo = url.searchParams.get("repo") ?? "";
        if (repo === DEMO_REPO_URL) return route.fulfill({ status: 200, contentType: "application/json", body: demoBody() });
        // An error body with a message that must never show (12.4).
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "missing-package-json", message: "SECRET-DETAIL from the server" }) });
      });
      const consoleText: string[] = [];
      page.on("console", (m) => consoleText.push(m.text()));
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);
      const field = page.getByLabel("GitHub repository to scan");
      await field.fill("someone/not-there");
      await field.press("Enter");
      // 12.1, 12.2: one sentence, one next step and two buttons.
      const card = page.locator(".failure-card");
      await expect(card).toBeVisible();
      // 19.3, 19.4: the Dry line opens the card, hidden from assistive technology, before the plain sentence.
      await expect(card.locator(":scope > :first-child")).toHaveText("We knocked, and nobody answered.");
      await expect(card.locator(".failure-dry")).toHaveAttribute("aria-hidden", "true");
      await expect(card.locator(".failure-sentence")).toHaveText("We could not read that repo.");
      await expect(card.locator(".failure-next")).toHaveText("Check the spelling. Sexton can only read public repos with a package.json at the top.");
      await expect(card.getByRole("button")).toHaveText(["Try the demo repo", "Back to the sample"]);
      await expect(page.locator("body")).not.toContainText("SECRET-DETAIL");
      expect(consoleText.join("\n")).not.toContain("SECRET-DETAIL");
      await expectInViewport(page, ".failure-card");
      // Review against the approved design: the page of the Sample scan stays under the card, and so does its tag (D6).
      await expect(page.locator(".scene-veil .failure-card")).toBeVisible();
      await expect(page.locator("h1.headline")).toHaveText("1 of 12 dependencies needs you now.");
      if (size.width >= 1300) await expect(page.locator(".scan-tag")).toHaveText("Sample scan");
      // 12.5: Try the demo repo scans hsiddhu2/sexton-demo.
      await card.getByRole("button", { name: "Try the demo repo" }).click();
      await expect(card).toHaveCount(0);
      await expect(grave(page, "left-padder")).toHaveCount(1);
      expect(new URL(page.url()).searchParams.get("repo")).toBe(DEMO_REPO_URL);
      expect(g.api).toEqual([`/api/scan?repo=${encodeURIComponent("https://github.com/someone/not-there")}`, `/api/scan?repo=${encodeURIComponent(DEMO_REPO_URL)}`]);
      // 12.6: Back to the sample, after another failure.
      await field.fill("someone/not-there");
      await field.press("Enter");
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: "Back to the sample" }).click();
      await expect(card).toHaveCount(0);
      await expect(grave(page, "left-padder")).toHaveCount(1);
      expect(new URL(page.url()).search).toBe("");
      if (size.width >= 1300) await expect(page.locator(".scan-tag")).toHaveText("Sample scan");
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("the way back: the wordmark, Escape and browser Back", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      const context = await browser.newContext();
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);
      const home = page.locator(".headline");
      const wordmark = page.locator("header .wordmark").first();
      const dialog = page.getByRole("dialog");

      // A mark on the window survives every step that does not reload the page (10.2, 10.4, 17.4).
      const mark = (): Promise<void> =>
        page.evaluate(() => {
          (window as unknown as { __noReload?: boolean }).__noReload = true;
        });
      const expectNoReload = async (): Promise<void> => {
        expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true), "no reload").toBe(true);
      };
      await mark();
      // 10.15, 10.4: a Drawer adds one entry; browser Back closes it with no reload.
      await grave(page, "uuid").click();
      await expect(dialog).toBeVisible();
      expect(new URL(page.url()).searchParams.get("grave")).toBe("uuid");
      await page.goBack();
      await expect(dialog).toHaveCount(0);
      expect(new URL(page.url()).search).toBe("");
      // Forward opens it again; the scrim covers the header, as in the approved design, so its breadcrumb is the way home,
      // going back over the Drawer's entry (10.14, 10.17).
      await page.goForward();
      await expect(dialog).toBeVisible();
      const depth = await page.evaluate(() => history.length);
      await dialog.getByRole("button", { name: "← Cemetery" }).click();
      await expect(dialog).toHaveCount(0);
      expect(new URL(page.url()).search).toBe("");
      expect(await page.evaluate(() => history.length)).toBe(depth);
      await expect(home).toHaveText("1 of 12 dependencies needs you now.");

      await expectGravesClear(page);
      await expectNoReload();
      // A Replay: the wordmark goes home; Back returns to the Replay; Escape goes home (10.3).
      await page.goto("/?replay=axios");
      await mark();
      await expect(home).toHaveText("Watch the axios attack unfold");
      await wordmark.click();
      await expect(home).toHaveText("1 of 12 dependencies needs you now.");
      await page.goBack();
      await expect(home).toHaveText("Watch the axios attack unfold");
      await page.keyboard.press("Escape");
      await expect(home).toHaveText("1 of 12 dependencies needs you now.");
      expect(new URL(page.url()).search).toBe("");
      // The Replay's breadcrumb goes home too (10.1).
      await page.goBack();
      await expect(home).toHaveText("Watch the axios attack unfold");
      await page.locator(".crumbs").getByRole("button", { name: "← Cemetery" }).click();
      await expect(home).toHaveText("1 of 12 dependencies needs you now.");

      // The Guide page: Escape goes home, Back returns to it, the wordmark goes home.
      await page.getByRole("button", { name: "What is Sexton?" }).click();
      await expect(page.locator("main.guide")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(home).toHaveText("1 of 12 dependencies needs you now.");
      await page.goBack();
      await expect(page.locator("main.guide")).toBeVisible();
      await wordmark.click();
      await expect(page.locator("main.guide")).toHaveCount(0);

      // The List choice is kept by the Home action; Escape on Home with a Drawer closes only the Drawer.
      await page.getByRole("button", { name: "List", exact: true }).click();
      await page.getByRole("button", { name: "What is Sexton?" }).click();
      await wordmark.click();
      await expect(page.locator("table.list-table")).toBeVisible();
      await page.getByRole("button", { name: "Graveyard" }).click();
      await grave(page, "lodash").click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(home).toHaveText("1 of 12 dependencies needs you now.");
      await expectGravesClear(page);
      // No reload happened in any step since the Replay's address was opened.
      await expectNoReload();
      // 10.10: an unknown replay shows its card and loads nothing.
      await page.goto("/?replay=nope");
      await expect(page.getByRole("alert")).toContainText("That replay does not exist.");
      await expect(page.locator(".failure-dry")).toHaveText("No such ghost story is told here.");
      await page.getByRole("button", { name: "Back to the cemetery" }).click();
      await expect(home).toHaveText("1 of 12 dependencies needs you now.");
      await checkProbe(page, origin, g);
      await context.close();
    });

    test("axe finds no violation on Home, the List, the Drawer's tabs, a Replay and the Guide page", async ({ browser, baseURL }) => {
      const origin = new URL(baseURL ?? "http://localhost:4173").origin;
      // axe is injected as a script, which the page's policy rightly blocks: this one context sets the policy aside.
      const context = await browser.newContext({ bypassCSP: true });
      const page = await freshPage(context, size);
      const g = await guard(page, origin);
      const axe = async (view: string): Promise<void> => {
        if ((await page.evaluate(() => "axe" in window)) === false) await page.addScriptTag({ path: AXE_PATH });
        const violations = await page.evaluate(async () => {
          const run = (window as unknown as { axe: { run(ctx: Document, o: object): Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe;
          // As the unit axe check: colour contrast is proved by the contrast tests.
          const r = await run.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
          return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`);
        });
        expect(violations, view).toEqual([]);
      };
      await page.goto("/");
      await expect(grave(page, "left-padder")).toHaveCount(1);
      await axe("Home with the Welcome bar");
      await page.getByRole("button", { name: "Legend" }).click();
      await axe("Home with the Legend");
      await page.getByRole("button", { name: "Legend" }).click();
      await page.getByRole("button", { name: "Watch a real attack" }).click();
      await axe("Home with the attack picker");
      await page.getByRole("button", { name: "Watch a real attack" }).click();
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(page.locator("table.list-table")).toBeVisible();
      await axe("the List");
      await page.getByRole("button", { name: "Graveyard" }).click();
      await grave(page, "event-stream").click();
      const dialog = page.getByRole("dialog");
      await axe("the Drawer, Evidence");
      await dialog.getByRole("tab", { name: "The fix" }).click();
      await dialog.locator("details.pr-disclosure summary").click();
      await axe("the Drawer, The fix");
      await dialog.getByRole("tab", { name: "History" }).click();
      await axe("the Drawer, History");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Tour" }).click();
      await axe("the Tour");
      await page.keyboard.press("Escape");
      for (const id of ["axios", "keyv"]) {
        await page.goto(`/?replay=${id}`);
        await expect(page.locator(".step-panel")).toBeVisible();
        const count = await page.locator(".step-cards .step-card").count();
        for (let k = 0; k < count; k += 1) {
          await page.locator(".step-cards .step-card").nth(k).click();
          await axe(`the ${id} Replay, Step ${String(k + 1)}`);
        }
      }
      await page.getByRole("button", { name: "What is Sexton?" }).click();
      await expect(page.locator("main.guide")).toBeVisible();
      await axe("the Guide page");
      await checkProbe(page, origin, g);
      await context.close();
    });
  });
}

/** The texts of the matched elements that take more than one line, from the tops of their line boxes. */
async function multiLine(locator: Locator): Promise<string[]> {
  return locator.evaluateAll((els) =>
    els
      .filter((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        // Boxes on one line differ in top by a few pixels at most (a Term's border box against its text).
        const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top);
        return tops.length > 0 && Math.max(...tops) - Math.min(...tops) > 8;
      })
      .map((el) => (el as HTMLElement).innerText),
  );
}

for (const size of SIZES) {
  test(`review against the approved design at ${size.name}: an earlier date keeps the fit, and words stay whole`, async ({ browser, baseURL }) => {
    const origin = new URL(baseURL ?? "http://localhost:4173").origin;
    const context = await browser.newContext();
    const page = await freshPage(context, size);
    const g = await guard(page, origin);
    await page.goto("/");
    await expect(grave(page, "left-padder")).toHaveCount(1);
    await scenePainted(page);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    // D1: the Scene, its fit scale and every grave stay put at an earlier date, and at 1440 by 900 the Footer bar with
    // the slider stays above the fold.
    const sample = async (): Promise<string> =>
      page.evaluate(() => {
        const canvas = document.querySelector("canvas.scene-canvas")?.getBoundingClientRect();
        const boxes = window.__sextonTiming?.artBoxes() ?? [];
        return JSON.stringify({ h: Math.round(canvas?.height ?? 0), boxes: boxes.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)]) });
      });
    let before = "";
    await expect
      .poll(async () => {
        const now = await sample();
        const same = now === before;
        before = now;
        return same;
      }, { intervals: [400, 400, 400, 400, 400, 400, 400, 400] })
      .toBe(true);
    const range = page.getByLabel("History date");
    await range.focus();
    await page.keyboard.press("Home");
    await expect(page.getByRole("button", { name: "Back to now" })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await sample()).toBe(before);
    if (!size.narrow) {
      const foot = await page.locator(".foot-bar").boundingBox();
      expect((foot?.y ?? 0) + (foot?.height ?? 999), "the Footer bar's bottom").toBeLessThanOrEqual(size.height);
      await expectInViewport(page, "#history-date");
    }
    await page.getByRole("button", { name: "Back to now" }).click();
    await page.waitForTimeout(400);
    expect(await sample()).toBe(before);

    // D5: from a grave straight onto the Inspector's first Term: the Term that opens is one the Panel shows.
    if (!size.narrow) {
      await grave(page, "lodash").hover();
      await expect(page.locator(".inspector-name")).toHaveText("lodash");
      await page.locator(".inspector .term").first().click();
      await expect(page.locator(".term-pop")).toBeVisible();
      const shown = await page.locator(".inspector .term").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["term"]));
      expect(shown).toContain(await page.locator(".term-pop-name").textContent());
      await page.keyboard.press("Escape");
    }

    // D3: no Evidence label, value or source host breaks inside a word.
    await page.goto("/?grave=event-stream");
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("table.drawer-signals tbody tr").first()).toBeVisible();
    const broken = await multiLine(dialog.locator("table.drawer-signals td.drawer-signal-label, table.drawer-signals td.drawer-signal-source a"));
    expect(broken, "labels or source hosts on more than one line").toEqual([]);
    await expect(dialog.locator("table.drawer-signals tbody tr").first().locator("td").nth(1)).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
    if (size.narrow) await expectNoSidewaysScroll(page);
    await page.keyboard.press("Escape");

    // D4: the List keeps whole words in its badges and names, and scrolls sideways inside its own box on a phone.
    await page.goto("/?view=list");
    await expect(page.locator(".list-table tbody tr").first()).toBeVisible();
    const split = await multiLine(page.locator(".list-table .badge, .list-open"));
    expect(split, "badges or names on more than one line").toEqual([]);
    if (size.narrow) {
      const scrolls = await page.locator(".list-view").evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(scrolls, "the List scrolls sideways inside its box").toBe(true);
      await expectNoSidewaysScroll(page);
    }
    await checkProbe(page, origin, g);
    await context.close();
  });
}

/**
 * Requirement 3.26: the boxes of the page, each in page coordinates so a scroll does not count as a move, except the
 * sticky header, which is read where it shows in the viewport.
 */
async function layoutBoxes(page: Page, selectors: readonly string[]): Promise<string> {
  return page.evaluate((sels) => {
    const out: Record<string, number[] | null> = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el === null) {
        out[sel] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      const dy = sel === ".site-header" ? 0 : window.scrollY;
      out[sel] = [r.left + window.scrollX, r.top + dy, r.width, r.height];
    }
    return JSON.stringify(out);
  }, selectors);
}

/** Waits until two samples 400 ms apart agree, so the Scene card's one settle after the first paint is over. */
async function settledBoxes(page: Page, selectors: readonly string[]): Promise<string> {
  let before = "";
  await expect
    .poll(async () => {
      const now = await layoutBoxes(page, selectors);
      const same = now === before;
      before = now;
      return same;
    }, { intervals: [400, 400, 400, 400, 400, 400, 400, 400] })
    .toBe(true);
  return before;
}

const HOME_BOXES = [".site-header", ".inspector", ".fix-order", ".scene-card", ".foot-bar", ".site-footer"] as const;
const REPLAY_BOXES = [".site-header", ".step-panel", ".why-card", ".replay-stage", ".replay-stage .date-badge", ".foot-bar", ".site-footer"] as const;

for (const size of SIZES) {
  test(`requirement 3.26 at ${size.name}: pointing at or selecting a grave or a List row moves no box`, async ({ browser, baseURL }) => {
    const origin = new URL(baseURL ?? "http://localhost:4173").origin;
    const context = await browser.newContext();
    const page = await freshPage(context, size);
    const g = await guard(page, origin);
    await page.goto("/");
    await expect(grave(page, "left-padder")).toHaveCount(1);
    await scenePainted(page);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const names = DEMO.report.packages.map((p) => p.name);
    expect(names.length).toBeGreaterThan(5);
    const home = await settledBoxes(page, HOME_BOXES);
    const unchanged = async (what: string): Promise<void> => {
      expect(await layoutBoxes(page, HOME_BOXES), `the boxes after ${what}`).toBe(home);
    };

    // Hover every grave of the demo in turn: the Inspector shows each, and no box moves.
    for (const name of names) {
      await grave(page, name).hover();
      await expect(page.locator(".inspector-name")).toHaveText(name);
      await unchanged(`hovering ${name}`);
    }
    // Select by the Fix order rows (3.21), then walk every grave with the keys (3.23).
    await pressOutside(page);
    const rows = page.locator(".fix-order .fix-row");
    for (let i = 0; i < (await rows.count()); i += 1) {
      await rows.nth(i).click();
      await expect(rows.nth(i)).toHaveClass(/fix-row-current/);
      await unchanged(`pressing Fix order row ${String(i + 1)}`);
    }
    await page.locator("h1.headline").click();
    for (let i = 0; i < names.length; i += 1) {
      await page.keyboard.press("ArrowRight");
      await unchanged(`Right ${String(i + 1)} times`);
    }
    // A grave pressed opens its Drawer; it closes, and the Selected grave it leaves moves nothing.
    for (const name of names.slice(0, 4)) {
      await grave(page, name).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await pressOutside(page);
      await expect(page.locator(".inspector-name")).toHaveText(name);
      await unchanged(`selecting ${name}`);
    }

    // The List: hovering and pressing its rows moves no box either.
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator(".list-table tbody .list-open")).toHaveCount(names.length);
    const list = await settledBoxes(page, HOME_BOXES);
    const open = page.locator(".list-table tbody .list-open");
    for (let i = 0; i < names.length; i += 1) {
      await open.nth(i).hover();
      expect(await layoutBoxes(page, HOME_BOXES), `the boxes hovering List row ${String(i + 1)}`).toBe(list);
    }
    for (let i = 0; i < names.length; i += 3) {
      const name = (await open.nth(i).textContent()) ?? "";
      await open.nth(i).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await pressOutside(page);
      await expect(page.locator(".inspector-name")).toHaveText(name);
      expect(await layoutBoxes(page, HOME_BOXES), `the boxes after pressing List row ${name}`).toBe(list);
    }
    await checkProbe(page, origin, g);
    await context.close();
  });

  test(`requirement 3.26 at ${size.name}: no box moves across the Steps of either Replay`, async ({ browser, baseURL }) => {
    const origin = new URL(baseURL ?? "http://localhost:4173").origin;
    const context = await browser.newContext();
    const page = await freshPage(context, size);
    const g = await guard(page, origin);
    for (const id of ["axios", "keyv"]) {
      await page.goto(`/?replay=${id}`);
      const panel = page.locator(".step-panel");
      await expect(panel.locator("#step-heading")).toContainText("Step 1 of");
      await scenePainted(page);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const first = await settledBoxes(page, REPLAY_BOXES);
      const count = await page.locator(".step-cards .step-card").count();
      expect(count).toBeGreaterThan(1);
      for (let k = 2; k <= count; k += 1) {
        await panel.getByRole("button", { name: "Next step" }).click();
        await expect(panel.locator("#step-heading")).toContainText(`Step ${String(k)} of ${String(count)}`);
        await page.waitForTimeout(100);
        expect(await layoutBoxes(page, REPLAY_BOXES), `the ${id} boxes at Step ${String(k)}`).toBe(first);
      }
      await panel.getByRole("button", { name: "Back", exact: true }).click();
      expect(await layoutBoxes(page, REPLAY_BOXES), `the ${id} boxes after Back`).toBe(first);
      for (let k = 0; k < count; k += 1) {
        await page.locator(".step-cards .step-card").nth(k).click();
        await expect(panel.locator("#step-heading")).toContainText(`Step ${String(k + 1)} of`);
        expect(await layoutBoxes(page, REPLAY_BOXES), `the ${id} boxes at Step card ${String(k + 1)}`).toBe(first);
      }
    }
    await checkProbe(page, origin, g);
    await context.close();
  });
}

test("requirement 16.2: 300 graves repaint within the frame budget at 1440 by 900, with and without a filter", async ({ browser, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  const context = await browser.newContext();
  const page = await freshPage(context, SIZES[0] as Size);
  const g = await guard(page, origin);
  const big = scan300(DEMO as unknown as Parameters<typeof scan300>[0]);
  await page.route((url) => url.pathname === SCAN_300_PATH, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(big) }));
  await page.goto(`/?scan=${SCAN_300_PATH}`);
  await expect(page.locator("button.grave-button")).toHaveCount(SCAN_300_COUNT);
  await scenePainted(page);
  const median = (xs: readonly number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
  };
  const time = async (label: string): Promise<void> => {
    const times = await page.evaluate(() => window.__sextonTiming?.redraw(30) ?? []);
    expect(times).toHaveLength(30);
    const m = median(times);
    console.log(`clean-site: median repaint of ${String(SCAN_300_COUNT)} graves at 1440 by 900, ${label}: ${m.toFixed(2)} ms (budget ${String(BUDGET_MS)} ms)`);
    expect(m).toBeLessThanOrEqual(BUDGET_MS);
  };
  await time("at rest");
  // 2.7: a filter draws the other States' graves dimmed, in save and restore around each.
  await page.locator(".chips .chip-dead").click();
  await expect(page.locator(".chips .chip-dead")).toHaveAttribute("aria-pressed", "true");
  await scenePainted(page);
  await time("with the Dead filter");
  await page.locator(".chips .chip-dead").click();
  // With the hover ring on a grave.
  await page.locator("button.grave-button").nth(40).hover();
  await time("with the hover ring");
  await expectGravesClear(page);
  await checkProbe(page, origin, g);
  await context.close();
});

/** Runs in the page before the site: play and pause only count, so no sound plays, and every audio element is kept. */
function quietMedia(): void {
  const w = window as unknown as { __media: { plays: number; pauses: number; made: HTMLAudioElement[] } };
  const media = { plays: 0, pauses: 0, made: [] as HTMLAudioElement[] };
  w.__media = media;
  HTMLMediaElement.prototype.play = function play(): Promise<void> {
    media.plays += 1;
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(): void {
    media.pauses += 1;
  };
  const Real = window.Audio;
  window.Audio = new Proxy(Real, {
    construct(target, args, next) {
      const element = Reflect.construct(target, args, next) as HTMLAudioElement;
      media.made.push(element);
      return element;
    },
  });
}

// Spec clean-site, task 16 (14.2, 14.3, 14.4, 14.7, 14.8): pressing Music makes exactly one looping audio element from
// the page origin, and pressing it again pauses that element. Play is stubbed, so no sound plays in the test.
test("requirement 14.7: Music makes one looping audio element from the site origin on the first press, and the next press pauses it", async ({ browser, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  const context = await browser.newContext();
  await context.addInitScript(quietMedia);
  const page = await freshPage(context, SIZES[0] ?? { name: "1440 by 900", width: 1440, height: 900, narrow: false });
  const g = await guard(page, origin);
  await page.goto("/");
  await expect(grave(page, "left-padder")).toHaveCount(1);
  const music = page.getByRole("button", { name: "Music" });
  await expect(music).toHaveAttribute("aria-pressed", "false");
  // Before the press: the probe holds, with no AudioContext and no audio element.
  await checkProbe(page, origin, g);
  const media = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __media: { plays: number; pauses: number; made: HTMLAudioElement[] } }).__media;
      return { plays: m.plays, pauses: m.pauses, made: m.made.map((a) => ({ src: a.src, loop: a.loop })) };
    });
  expect(await media()).toEqual({ plays: 0, pauses: 0, made: [] });

  await music.click();
  await expect(music).toHaveAttribute("aria-pressed", "true");
  const on = await media();
  expect(on.made).toHaveLength(1);
  expect(on.made[0]?.loop).toBe(true);
  expect(new URL(on.made[0]?.src ?? "").origin).toBe(origin);
  expect(new URL(on.made[0]?.src ?? "").pathname).toBe("/music/ghost-party.mp3");
  expect(on.plays).toBe(1);
  expect(on.pauses).toBe(0);

  await music.click();
  await expect(music).toHaveAttribute("aria-pressed", "false");
  const off = await media();
  expect(off.made).toHaveLength(1);
  expect(off.pauses).toBe(1);
  expect(off.plays).toBe(1);

  const probe = await page.evaluate(() => window.__cleanProbe);
  expect(probe?.audioContexts, "AudioContexts made").toBe(0);
  expect(probe?.audioElements, "audio elements made").toBe(1);
  expect(await page.locator("audio").count()).toBe(0);
  const outside = g.requests.filter((u) => new URL(u).origin !== origin);
  expect(outside, "requests outside the page origin").toEqual([]);
  await context.close();
});
