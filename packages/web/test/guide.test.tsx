// Spec judge-path, requirement 1: the first-visit Guide.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { GUIDE_CLOSED, GUIDE_KEY, readGuideClosed, setGuideAllowedForTests, writeGuideClosed } from "../src/guide/guide-pref.js";
import { dockTops, GUIDE_GAP, GUIDE_MARGIN, GUIDE_STEPS, GUIDE_W, guideArrow, guideCandidates, placeGuide, type GuidePlace } from "../src/guide/guide-steps.js";
import { labelRect } from "../src/scene/art-box.js";
import { intersects } from "../src/scene/art-box.js";
import { planScene, type Rect } from "../src/scene/layout.js";
import { STATES } from "../src/load/lists.js";
import { arbAdvisoryMode, scenePackage } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { readReplayText } from "./support/replay-fixture.js";
import { setMedia } from "./setup.js";

const ORIGIN = "http://localhost";
const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: { "color-contrast": { enabled: false } },
};

function fetchOf(body: (url: string) => string): typeof fetch {
  return ((input: RequestInfo | URL): Promise<Response> => Promise.resolve(new Response(body(String(input)), { status: 200 }))) as typeof fetch;
}
const demoFetch = fetchOf((url) => (url.includes("/replay/axios.json") ? readReplayText("axios") : readDemoScanText()));

function mount(options: { search?: string; apiBase?: string | null } = {}) {
  return render(<App fetchFn={demoFetch} apiBase={options.apiBase ?? null} initialSearch={options.search ?? ""} pageOrigin={ORIGIN} />);
}

async function ready(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector("button[data-grave-index]")).not.toBeNull();
  });
}

const guide = (): HTMLElement | null => document.querySelector("section.guide");
const title = (): string | null | undefined => guide()?.querySelector("h2")?.textContent;

beforeEach(() => {
  setGuideAllowedForTests(true);
  window.localStorage.clear();
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Feature: judge-path, Property 1: The Guide card stays on screen and off every name", () => {
  const arbCase = fc.record({
    rows: fc.array(fc.tuple(fc.constantFrom(...STATES), arbAdvisoryMode), { minLength: 1, maxLength: 60 }),
    width: fc.integer({ min: 360, max: 1920 }),
    vh: fc.integer({ min: 480, max: 1200 }),
    top: fc.integer({ min: -400, max: 1400 }),
    anchor: fc.record({ x: fc.integer({ min: -100, max: 2000 }), y: fc.integer({ min: -200, max: 1400 }), w: fc.integer({ min: 0, max: 300 }), h: fc.integer({ min: 0, max: 260 }) }),
    height: fc.integer({ min: 120, max: 260 }),
    header: fc.option(fc.integer({ min: 40, max: 200 }), { nil: null }),
    footer: fc.option(fc.integer({ min: 60, max: 160 }), { nil: null }),
  });
  it("takes a place beside the Anchor on the first side that has one inside the viewport and clear of every name, else the lowest clear dock band", () => {
    fc.assert(
      fc.property(arbCase, ({ rows, width, vh, top, anchor, height, header, footer }) => {
        const packages = rows.map(([state, mode], i) => scenePackage(`p${String(i)}`, state, mode));
        const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0 });
        // The scene's names in client coordinates, the scene scrolled to `top`.
        const labels: Rect[] = plan.graves.map((g) => {
          const l = labelRect(g);
          return { x: l.x, y: l.y - top, w: l.w, h: l.h };
        });
        const viewport = { width, height: vh, headerBottom: header, footerTop: footer === null ? null : vh - footer };
        const place = placeGuide(anchor, viewport, height, labels);
        const w = Math.min(GUIDE_W, width - 2 * GUIDE_MARGIN);
        const card = (p: GuidePlace): Rect => ({ x: p.left, y: p.top, w, h: height });
        const clear = (p: GuidePlace): boolean => !labels.some((l) => intersects(l, card(p)));
        const inside = (p: GuidePlace): boolean => p.left >= GUIDE_MARGIN && p.left + w <= width - GUIDE_MARGIN + 1e-9 && p.top >= GUIDE_MARGIN && p.top + height <= vh - GUIDE_MARGIN + 1e-9;
        const sides = ["right", "left", "above", "below"] as const;
        const sideIndex = (sides as readonly string[]).indexOf(place.side);
        if (sideIndex >= 0) {
          // A side place: inside the viewport, clear of every name, beside the Anchor and facing part of it.
          expect(inside(place)).toBe(true);
          expect(clear(place)).toBe(true);
          if (place.side === "right") expect(place.left).toBe(anchor.x + anchor.w + GUIDE_GAP);
          if (place.side === "left") expect(place.left + w).toBe(anchor.x - GUIDE_GAP);
          if (place.side === "above") expect(place.top + height).toBe(anchor.y - GUIDE_GAP);
          if (place.side === "below") expect(place.top).toBe(anchor.y + anchor.h + GUIDE_GAP);
          if (place.side === "right" || place.side === "left") {
            expect(place.top).toBeLessThanOrEqual(Math.max(anchor.y + anchor.h, GUIDE_MARGIN));
            expect(place.top + height).toBeGreaterThanOrEqual(Math.min(anchor.y, vh - GUIDE_MARGIN));
          }
          // No earlier side had a place inside the viewport and clear of every name.
          for (const earlier of sides.slice(0, sideIndex)) {
            for (const p of guideCandidates(anchor, viewport, height, earlier)) expect(inside(p) && clear(p)).toBe(false);
          }
          return;
        }
        // A dock: no side place qualified at all.
        for (const side of sides) for (const p of guideCandidates(anchor, viewport, height, side)) expect(inside(p) && clear(p)).toBe(false);
        expect(["dock", "dock-forced"]).toContain(place.side);
        expect(place.left).toBeGreaterThanOrEqual(GUIDE_MARGIN);
        expect(place.left + w).toBeLessThanOrEqual(width - GUIDE_MARGIN);
        const lo = (header ?? 0) + GUIDE_MARGIN;
        const hi = Math.max(lo, (viewport.footerTop ?? vh) - height - GUIDE_MARGIN);
        const left = Math.max(GUIDE_MARGIN, Math.min(anchor.x, width - w - GUIDE_MARGIN));
        const free = (top: number): boolean => ![...labels, anchor].some((l) => intersects(l, { x: left, y: top, w, h: height }));
        const tops = dockTops(lo, hi);
        if (place.side === "dock") {
          // Clear of every name and of the Anchor, and the lowest such band.
          expect(free(place.top)).toBe(true);
          expect(tops.slice(0, tops.indexOf(place.top)).some(free)).toBe(false);
        } else {
          // Forced only when no band is clear.
          expect(tops.some(free)).toBe(false);
          expect(place.top).toBe(hi);
        }
      }),
      { numRuns: 100 },
    );
  }, 60_000);
});

describe("the Guide card's notch", () => {
  it("sits on the edge that faces the Anchor and points at the part it faces, or is absent", () => {
    const vp = { width: 1440 };
    const anchor = { x: 100, y: 500, w: 200, h: 220 };
    expect(guideArrow({ left: 312, top: 480, side: "right" }, anchor, vp, 180)).toEqual({ edge: "left", offset: (500 + 660) / 2 - 480 });
    expect(guideArrow({ left: 50, top: 308, side: "above" }, anchor, vp, 180)).toEqual({ edge: "bottom", offset: (100 + 300) / 2 - 50 });
    // A dock is not beside its Anchor: no notch, so it never points at whatever lies between.
    expect(guideArrow({ left: 120, top: 100, side: "dock" }, anchor, vp, 180)).toBeNull();
    expect(guideArrow({ left: 900, top: 100, side: "dock" }, anchor, vp, 180)).toBeNull();
  });
});

describe("Feature: judge-path, Property 2: The Guide is remembered only as closed", () => {
  it("reads closed exactly for the stored value closed, writes closed, and never throws", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), fc.boolean(), (stored, throwing) => {
        const map = new Map<string, string>();
        if (stored !== null) map.set(GUIDE_KEY, stored);
        const storage = throwing
          ? { getItem: (): string | null => { throw new Error("blocked"); }, setItem: (): void => { throw new Error("blocked"); } }
          : { getItem: (k: string): string | null => map.get(k) ?? null, setItem: (k: string, v: string): void => { map.set(k, v); } };
        if (throwing) {
          expect(readGuideClosed(storage)).toBe(false);
          expect(() => {
            writeGuideClosed(storage);
          }).not.toThrow();
          return;
        }
        expect(readGuideClosed(storage)).toBe(stored === GUIDE_CLOSED);
        writeGuideClosed(storage);
        expect(readGuideClosed(storage)).toBe(true);
      }),
      { numRuns: 100 },
    );
    expect(readGuideClosed(null)).toBe(false);
  });
});

describe("the Guide on the page", () => {
  it("opens by itself on the Demo at step 1 without moving focus", async () => {
    mount();
    await ready();
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    expect(title()).toBe(GUIDE_STEPS[0]?.title);
    expect(guide()?.getAttribute("role")).toBe("dialog");
    expect(guide()?.getAttribute("aria-modal")).toBe("false");
    expect(guide()?.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("does not open by itself once this browser closed it", async () => {
    window.localStorage.setItem(GUIDE_KEY, GUIDE_CLOSED);
    mount();
    await ready();
    expect(guide()).toBeNull();
  });

  it("does not open by itself on a replay", async () => {
    mount({ search: "?replay=axios" });
    await ready();
    expect(guide()).toBeNull();
  });

  it("does not open by itself on a scan that is not the Demo", async () => {
    render(<App fetchFn={fetchOf(() => readDemoScanText())} apiBase={null} initialSearch="?scan=/scans/other.json" pageOrigin={ORIGIN} />);
    await ready();
    expect(guide()).toBeNull();
  });

  it("walks the four steps in order with Back, Next and Done, and Done stores closed", async () => {
    const user = userEvent.setup();
    mount();
    await ready();
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    for (let i = 1; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(title()).toBe(GUIDE_STEPS[i]?.title);
      expect(guide()?.textContent).toContain(`Step ${String(i + 1)} of 4`);
    }
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(title()).toBe(GUIDE_STEPS[2]?.title);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(guide()).toBeNull();
    expect(window.localStorage.getItem(GUIDE_KEY)).toBe(GUIDE_CLOSED);
  });

  it("names step 4's Anchor and points steps 1 to 3 at the Fix-first grave", () => {
    expect(GUIDE_STEPS.map((s) => s.anchor)).toEqual(["fix-first-grave", "fix-first-grave", "fix-first-grave", "replay-axios"]);
    expect(GUIDE_STEPS[3]?.title).toBe("Replay an attack");
    expect(GUIDE_STEPS[3]?.body).toContain('"axios, Mar 2026"');
  });

  it("Close stores closed and, from inside, returns focus to the Guide button", async () => {
    const user = userEvent.setup();
    mount();
    await ready();
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Close guide" }));
    expect(guide()).toBeNull();
    expect(window.localStorage.getItem(GUIDE_KEY)).toBe(GUIDE_CLOSED);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Guide" }));
  });

  it("Escape on the Guide closes it; Escape elsewhere does not", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await ready();
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    const grave = container.querySelector<HTMLElement>('button[data-grave-index="0"]');
    act(() => {
      grave?.focus();
    });
    await user.keyboard("{Escape}");
    expect(guide()).not.toBeNull();
    expect(window.localStorage.getItem(GUIDE_KEY)).toBeNull();
    // Escape while focus is in the Guide.
    act(() => {
      screen.getByRole("button", { name: "Next" }).focus();
    });
    await user.keyboard("{Escape}");
    expect(guide()).toBeNull();
    expect(window.localStorage.getItem(GUIDE_KEY)).toBe(GUIDE_CLOSED);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Guide" }));
  });

  it("closing while focus is outside leaves focus where it is", async () => {
    mount();
    await ready();
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    const field = screen.getByRole("button", { name: "Legend" });
    act(() => {
      field.focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Close guide" }));
    expect(guide()).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("the Guide button opens it again at step 1 and focuses its heading", async () => {
    window.localStorage.setItem(GUIDE_KEY, GUIDE_CLOSED);
    const user = userEvent.setup();
    mount();
    await ready();
    expect(guide()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Guide" }));
    expect(title()).toBe(GUIDE_STEPS[0]?.title);
    expect(document.activeElement).toBe(guide()?.querySelector("h2"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Guide" }));
    expect(title()).toBe(GUIDE_STEPS[0]?.title);
  });

  it("reaches its controls by Tab right after the Guide button, in the order Back, Next, Close", async () => {
    window.localStorage.setItem(GUIDE_KEY, GUIDE_CLOSED);
    const user = userEvent.setup();
    mount();
    await ready();
    await user.click(screen.getByRole("button", { name: "Guide" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    act(() => {
      screen.getByRole("button", { name: "Guide" }).focus();
    });
    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await user.tab();
      seen.push((document.activeElement as HTMLElement).textContent ?? "");
    }
    expect(seen).toEqual(["Back", "Next", "Close"]);
  });

  it("hides while the drawer is open, moves to step 3 when the drawer opens at step 1, and comes back at step 3", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await ready();
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    const grave = container.querySelector<HTMLElement>('button[data-grave-index="0"]');
    if (grave === null) throw new Error("no grave");
    await user.click(grave);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /left-padder/ })).toBeTruthy();
    });
    expect(guide()).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    expect(title()).toBe(GUIDE_STEPS[2]?.title);
  });

  it("does not take focus when it comes back after the drawer closes, once opened by its button", async () => {
    window.localStorage.setItem(GUIDE_KEY, GUIDE_CLOSED);
    const user = userEvent.setup();
    const { container } = mount();
    await ready();
    await user.click(screen.getByRole("button", { name: "Guide" }));
    const grave = container.querySelector<HTMLElement>('button[data-grave-index="0"]');
    if (grave === null) throw new Error("no grave");
    await user.click(grave);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /left-padder/ })).toBeTruthy();
    });
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    expect(document.activeElement).toBe(grave);
  });

  it("has no transition or animation under Reduced motion", async () => {
    setMedia("(prefers-reduced-motion: reduce)", true);
    let animated = 0;
    const proto = Element.prototype as unknown as { animate?: unknown };
    const before = proto.animate;
    proto.animate = () => {
      animated += 1;
      return {};
    };
    try {
      mount();
      await ready();
      await waitFor(() => {
        expect(guide()).not.toBeNull();
      });
      await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
      expect(animated).toBe(0);
      expect(guide()?.style.transition ?? "").toBe("");
    } finally {
      proto.animate = before;
    }
  });

  it("has no axe violation with the Guide open", async () => {
    mount();
    await ready();
    await waitFor(() => {
      expect(guide()).not.toBeNull();
    });
    const result = await axe.run(document, AXE_OPTIONS);
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
