// Spec clean-site, task 7: the Guide page (9.1 to 9.4, 9.10, 11.2), the Legend as a Pop-over with its eight entries
// (13.1, 13.2, 13.11, 13.12) and the Tour with its card placement (13.3 to 13.10, Property 8 second half).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { claim } from "../src/copy/claims.js";
import { resetWelcomeForTests } from "../src/guide/welcome-pref.js";
import { LEGEND_FIX_ORDER, LEGEND_HEADING } from "../src/header/Legend.js";
import { CARD_HEIGHT, CARD_MARGIN, placeCard } from "../src/tour/place-card.js";
import { dims, SPOT_PAD } from "../src/tour/Tour.js";
import { TOUR_OFF_TEXT, TOUR_STEPS } from "../src/tour/tour-steps.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { readReplayText } from "./support/replay-fixture.js";

afterEach(cleanup);
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
  window.localStorage.clear();
  resetWelcomeForTests();
});

const ORIGIN = "http://localhost";
const API = "https://api.example";
const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/styles.css"), "utf8");

function mount(apiBase: string | null = null) {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return Promise.resolve(new Response(url.endsWith("/replay/axios.json") ? readReplayText("axios") : readDemoScanText(), { status: 200 }));
  }) as typeof fetch;
  return { ...render(<App fetchFn={fetchFn} apiBase={apiBase} initialSearch="" pageOrigin={ORIGIN} />), urls };
}
async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}
function ruleBody(selector: string): string {
  const m = new RegExp(`(^|\\n)${selector.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`).exec(CSS);
  return m?.[2] ?? "";
}

describe("the Guide page (9.1 to 9.4, 9.10, 11.2)", () => {
  it("holds its sections in order, from the Claim registry", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "What is Sexton?" }));
    const guide = container.querySelector("main.guide") as HTMLElement;
    expect(within(guide).getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("← Cemetery/What is Sexton?");
    expect(guide.querySelector(".eyebrow")?.textContent).toBe("The two-minute guide");
    expect(guide.querySelector("h1")?.textContent).toBe("Sexton looks after the code your app borrows.");
    expect(guide.querySelector(".guide-lead")?.textContent).toBe(claim("guide.lead"));
    expect([...guide.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([
      "The problem, in plain words",
      "What Sexton does",
      "What the five graves mean",
      "Questions people ask",
    ]);
    expect([...guide.querySelectorAll(".guide-step")].map((s) => s.querySelector("h3")?.textContent)).toEqual([
      "It reads your list",
      "It shows you a graveyard",
      "It writes the fix",
    ]);
    const graves = [...guide.querySelectorAll(".guide-grave")];
    expect(graves.map((g) => g.querySelector(".badge")?.textContent)).toEqual(["Possessed", "Dead", "Haunted", "Restless", "Alive"]);
    expect(graves.map((g) => g.querySelector(".guide-grave-meaning")?.textContent)).toEqual([
      "Something changed that should not have. Act now.",
      "Deprecated, or abandoned with an open advisory.",
      "A High or Critical advisory is open.",
      "A lower advisory, or no release in two years.",
      "No rule matched. Healthy.",
    ]);
    // Each grave is drawn by the scene painter, named in words.
    for (const g of graves) expect(g.querySelector("canvas.grave-picture")?.getAttribute("role")).toBe("img");
    expect([...guide.querySelectorAll(".guide-question")].map((q) => q.textContent)).toEqual([
      "What is a pull request?",
      "Do I have to sign in to GitHub?",
      "So how does the pull request get opened?",
      "Can it check my repo automatically?",
      "How do I know it is telling the truth?",
    ]);
    expect(guide.querySelectorAll(".guide-answer")[1]?.textContent).toBe("No. Sexton reads public repos and never asks for your GitHub password.");
    expect(guide.querySelector(".guide-answer code")?.textContent).toBe("hsiddhu2/sexton-demo");
    expect([...guide.querySelectorAll(".guide-answer code")].map((c) => c.textContent)).toContain("sexton check");
    expect([...guide.querySelectorAll(".guide-buttons button")].map((b) => b.textContent)).toEqual(["Go to the cemetery", "Watch a real attack"]);
  });

  it("marks Terms in the answers, never in a heading or a button, and opens a Term's meaning", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "What is Sexton?" }));
    const guide = container.querySelector("main.guide") as HTMLElement;
    expect(guide.querySelectorAll(".guide-answer .term").length).toBeGreaterThan(0);
    expect(guide.querySelector("h1 .term, h2 .term, h3 .term, nav .term, .guide-buttons .term")).toBeNull();
    fireEvent.click(guide.querySelector(".guide-answer .term") as HTMLElement);
    expect(document.querySelector(".term-pop")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector(".term-pop")).toBeNull();
    expect(container.querySelector("main.guide")).not.toBeNull();
  });

  it("opens the axios Replay from Watch a real attack (9.3)", async () => {
    const { container, urls } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "What is Sexton?" }));
    fireEvent.click(within(container.querySelector(".guide-buttons") as HTMLElement).getByRole("button", { name: "Watch a real attack" }));
    await waitFor(() => {
      expect(container.querySelector("h1")?.textContent).toBe("Watch the axios attack unfold");
    });
    expect(urls).toContain(`${ORIGIN}/replay/axios.json`);
  });

  it("has no axe violation (16.9)", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "What is Sexton?" }));
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("the Legend (13.1, 13.2, 13.11, 13.12)", () => {
  it("opens under its button with the heading, eight entries in order and the fix order line, and closes on a second press", async () => {
    const { container } = mount();
    await ready();
    const toggle = screen.getByRole("button", { name: "Legend" });
    fireEvent.click(toggle);
    const panel = container.querySelector("#legend-panel") as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector(".pop-heading")?.textContent).toBe(LEGEND_HEADING);
    expect(LEGEND_HEADING).toBe("What each grave means");
    expect([...panel.querySelectorAll(".legend-chip")].map((c) => c.textContent)).toEqual([
      "PossessedSomething changed that should not have. Act now.",
      "DeadDeprecated, or abandoned with an open advisory.",
      "HauntedA High or Critical advisory is open.",
      "RestlessA lower advisory, or no release in two years.",
      "AliveNo rule matched. Healthy.",
      "Ghostone or more advisories",
      "Pennanta pull request was opened",
      "Moundnot published yet on the chosen date",
    ]);
    expect(panel.querySelector(".legend-triage")?.textContent).toBe(LEGEND_FIX_ORDER);
    expect(LEGEND_FIX_ORDER).toBe("Fix order: Possessed first, then Dead, Haunted, Restless. Then by advisory severity and reach.");
    fireEvent.click(toggle);
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("sits outside the page flow, so opening it moves nothing (13.2)", async () => {
    const { container } = mount();
    await ready();
    const main = container.querySelector("main") as HTMLElement;
    const before = main.innerHTML;
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    expect(main.innerHTML).toBe(before);
    expect(container.querySelector(".site-header #legend-panel")).not.toBeNull();
    expect(ruleBody(".pop")).toMatch(/position: absolute;/);
    expect(ruleBody(".legend")).toMatch(/position: relative;/);
  });

  it("closes on a press outside it and stays open on a press inside it (13.12)", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    const panel = container.querySelector("#legend-panel") as HTMLElement;
    fireEvent.pointerDown(panel.querySelector(".legend-chip") as HTMLElement);
    expect(panel.hidden).toBe(false);
    fireEvent.pointerDown(container.querySelector("h1") as HTMLElement);
    expect(panel.hidden).toBe(true);
  });
});

describe("Feature: clean-site, Property 8: Overlays clear the graves, and the Tour card fits", () => {
  it("places the Tour card inside the viewport with its 12 px margin for any target in any viewport from 320 by 480 to 1600 by 1000 and a card 150 to 300 px tall", () => {
    const arb = fc
      .record({ width: fc.integer({ min: 320, max: 1600 }), height: fc.integer({ min: 480, max: 1000 }) })
      .chain((viewport) =>
        fc.record({
          viewport: fc.constant(viewport),
          x: fc.integer({ min: 0, max: viewport.width }),
          y: fc.integer({ min: 0, max: viewport.height }),
          w: fc.integer({ min: 0, max: viewport.width }),
          h: fc.integer({ min: 0, max: viewport.height }),
          card: fc.integer({ min: 150, max: 300 }),
        }),
      )
      .map(({ viewport, x, y, w, h, card }) => ({ viewport, card, target: { x, y, w: Math.min(w, viewport.width - x), h: Math.min(h, viewport.height - y) } }));
    fc.assert(
      fc.property(arb, ({ viewport, target, card: height }) => {
        expect(placeCard(target, viewport)).toEqual(placeCard(target, viewport, CARD_HEIGHT));
        const card = placeCard(target, viewport, height);
        expect(card.width).toBe(Math.min(320, viewport.width - 24));
        expect(card.x).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(card.y).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(card.x + card.width).toBeLessThanOrEqual(viewport.width - CARD_MARGIN);
        expect(card.y + height).toBeLessThanOrEqual(viewport.height - CARD_MARGIN);
      }),
      { numRuns: 100 },
    );
  });

  it("puts the card below its target, else above it, else beside it", () => {
    const viewport = { width: 1440, height: 900 };
    expect(placeCard({ x: 100, y: 100, w: 200, h: 100 }, viewport)).toEqual({ x: 100, y: 214, width: 320 });
    expect(placeCard({ x: 100, y: 600, w: 200, h: 200 }, viewport)).toEqual({ x: 100, y: 396, width: 320 });
    const tall = placeCard({ x: 100, y: 100, w: 600, h: 780 }, viewport);
    expect(tall).toEqual({ x: 714, y: 120, width: 320 });
    expect(placeCard({ x: 10, y: 10, w: 340, h: 600 }, { width: 340, height: 640 }).width).toBe(316);
    // A measured card taller than CARD_HEIGHT still fits: it goes above a target near the bottom.
    expect(placeCard({ x: 100, y: 600, w: 200, h: 200 }, viewport, 260)).toEqual({ x: 100, y: 326, width: 320 });
  });

  it("dims everything around the spotlight and nothing inside it", () => {
    const viewport = { width: 1000, height: 800 };
    const box = { x: 100, y: 200, w: 300, h: 100 };
    const panels = dims(box, viewport);
    const area = panels.reduce((a, p) => a + p.w * p.h, 0);
    const hole = (box.w + 2 * SPOT_PAD) * (box.h + 2 * SPOT_PAD);
    expect(area).toBe(viewport.width * viewport.height - hole);
    expect(dims(null, viewport)).toEqual([{ x: 0, y: 0, w: 1000, h: 800 }]);
  });
});

describe("the Tour (13.3 to 13.10)", () => {
  it("dims the page, blocks presses with a full-screen layer, spotlights each part and places the card in the viewport", async () => {
    const { container } = mount(API);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Tour" }));
    const targets = ["scene", "inspector", "scan"];
    for (let step = 0; step < 3; step += 1) {
      const target = container.querySelector(`[data-tour="${targets[step] ?? ""}"]`);
      expect(target, `step ${String(step + 1)} target`).not.toBeNull();
      const card = container.querySelector(".tour-card") as HTMLElement;
      expect(card.getAttribute("role")).toBe("dialog");
      expect(card.getAttribute("aria-modal")).toBe("true");
      expect(card.querySelector(".eyebrow")?.textContent).toBe(`Step ${String(step + 1)} of 3`);
      expect(card.querySelector("h2")?.textContent).toBe(TOUR_STEPS[step]?.title);
      expect(card.querySelector(".tour-text")?.textContent).toBe(TOUR_STEPS[step]?.text);
      expect(container.querySelector(".tour-block")).not.toBeNull();
      expect(container.querySelectorAll(".tour-dim")).toHaveLength(4);
      expect(container.querySelector(".tour-spot")).not.toBeNull();
      const left = Number.parseFloat(card.style.left);
      const top = Number.parseFloat(card.style.top);
      expect(left).toBeGreaterThanOrEqual(12);
      expect(left + Number.parseFloat(card.style.width)).toBeLessThanOrEqual(window.innerWidth - 12);
      expect(top).toBeGreaterThanOrEqual(12);
      expect(document.activeElement?.textContent).toBe(step === 2 ? "Done" : "Next");
      fireEvent.click(within(card).getByRole("button", { name: step === 2 ? "Done" : "Next" }));
    }
    expect(container.querySelector(".tour")).toBeNull();
    expect(TOUR_STEPS[2].text).toBe(
      "Paste a public GitHub repo with a package.json at the top. Sexton reads it and builds its cemetery. No sign-in needed.",
    );
    expect(ruleBody(".tour-block")).toMatch(/position: fixed;\s*inset: 0;/);
    expect(ruleBody(".tour-dim")).toMatch(/pointer-events: none;/);
  });

  it("reads the scanning-off sentence on step 3 with no API base (13.4)", async () => {
    const { container } = mount(null);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(container.querySelector(".tour-text")?.textContent).toBe(TOUR_OFF_TEXT);
  });

  it("takes focus from a Drawer it replaces, keeps Tab inside its card, and gives focus back when it ends", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(container.querySelector("button.grave-button") as HTMLElement);
    expect(screen.getByRole("dialog")).toBeTruthy();
    const tourButton = screen.getByRole("button", { name: "Tour" });
    tourButton.focus();
    await act(async () => {
      fireEvent.click(tourButton);
      await Promise.resolve();
    });
    // The Drawer closed (the Tour takes the Home action first) and its focus return did not win.
    expect(container.querySelector(".drawer")).toBeNull();
    const card = container.querySelector(".tour-card") as HTMLElement;
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Next" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Skip" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Next" }));
    // A press on the dimmed page keeps focus in the card, and Tab from anywhere comes back to it.
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    (container.querySelector(".tour-block") as HTMLElement).dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(card.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(container.querySelector(".tour")).toBeNull();
    expect(document.activeElement).toBe(tourButton);
  });

  it("leaves Home as it was after Skip (13.10) and starts only on a press (13.8)", async () => {
    const { container } = mount();
    await ready();
    expect(container.querySelector(".tour")).toBeNull();
    const before = container.querySelector("h1")?.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(container.querySelector(".tour")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe(before);
    expect(container.querySelector("canvas:not(.ghost-picture)")).not.toBeNull();
  });
});
