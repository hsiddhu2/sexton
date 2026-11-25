// Spec cemetery-undead-2, requirement 7: speech Bubbles.
import type { State } from "@sexton/api";
import { act, cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STATES } from "../src/load/lists.js";
import { formRects, intersects, labelRect } from "../src/scene/art-box.js";
import { planScene } from "../src/scene/layout.js";
import { BUBBLE_MAX_W, BUBBLE_MIN_W, bubbleCandidates, bubbleHeight, placeBubble } from "../src/speech/bubble-place.js";
import { BUBBLE_SHOW_MS, BUBBLE_SLOT_MS, bubblesAt } from "../src/speech/bubble-schedule.js";
import { BUBBLE_LINES, bubbleLine, MAX_BUBBLE_CHARS } from "../src/speech/bubble-table.js";
import { Bubbles, bubbleLines, bubblesFor } from "../src/speech/Bubbles.js";
import { arbAdvisoryMode, arbSceneWidth, scenePackage } from "./arbitraries.js";

const NUM_RUNS = 100;
afterEach(cleanup);

/** The twelve reason templates of the Engine's state rule, with their State. */
const TEMPLATES: readonly { readonly state: State; readonly make: (n: number) => string; readonly line: string }[] = [
  { state: "Dead", make: () => "installed version is deprecated", line: "Deprecated, not departed." },
  { state: "Restless", make: () => "advisory of severity Moderate or Low", line: "One more minor bump and I am coming out." },
  { state: "Possessed", make: () => "maintainer change in the last 90 days", line: "Who has the keys now?" },
  { state: "Possessed", make: (n) => `provenance regression: ${String(n)}.0.1 has no provenance, ${String(n)}.0.0 had it`, line: "Papers? I left them in the last version." },
  { state: "Possessed", make: (n) => `install script added in ${String(n)}.2.0`, line: "I brought a script. It runs on install." },
  { state: "Possessed", make: (n) => `new dependency in ${String(n)}.0.1: dep-${String(n)}`, line: "I brought a plus-one. Nobody checked the list." },
  { state: "Possessed", make: (n) => `publisher changed in ${String(n)}.0.1: GitHub Actions to unknown`, line: "Published by hand. The robot usually does it." },
  { state: "Dead", make: (n) => `no release in ${String(24 + n)} months and an open advisory`, line: "Two years down here, and the hole is open." },
  { state: "Haunted", make: () => "advisory of severity High or Critical", line: "Boo. Severity High, or worse." },
  { state: "Restless", make: () => "all state signals unavailable", line: "Couldn't read my papers. Ask me again later." },
  { state: "Restless", make: (n) => `no release in ${String(24 + n)} months`, line: "Two years without a release. Getting restless." },
  { state: "Alive", make: () => "no rule matched", line: "Still kicking. The party hat stays on." },
];

const FORBIDDEN = ["left-padder", "event-stream", "uuid", "request", "left-pad", "node-sass", "lodash", "express", "moment", "colors", "semver", "react", "axios", "keyv", "npm", "GitHub", "jasonsaayman"];

describe("Feature: cemetery-undead-2, Property 4: Bubble lines come only from the table", () => {
  it("gives the table line for each template under its State, and null under another State or for any other text", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), fc.constantFrom(...STATES), fc.string(), (n, other, junk) => {
        for (const t of TEMPLATES) {
          expect(bubbleLine(t.state, t.make(n))).toBe(t.line);
          if (other !== t.state) expect(bubbleLine(other, t.make(n))).toBeNull();
        }
        const line = bubbleLine(other, junk);
        expect(line === null || Object.values(BUBBLE_LINES).includes(line)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
    // The signature takes a State and a reason only: no package name.
    expect(bubbleLine.length).toBe(2);
  });

  it("keeps every line short and names no person or project", () => {
    const lines = Object.values(BUBBLE_LINES);
    expect(lines).toHaveLength(12);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(MAX_BUBBLE_CHARS);
      for (const word of FORBIDDEN) expect(line.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("gives no line for the Not-published form", () => {
    expect(bubbleLines([scenePackage("a", "Alive", "none")], [{ state: null, reason: "installed version not yet published", ghost: false }])).toEqual([null]);
  });
});

describe("Feature: cemetery-undead-2, Property 5: At most two Bubbles, chosen by the clock alone", () => {
  it("returns at most two distinct eligible indices, none late in a slot, the same through a show window, two when it can", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 400 }), { maxLength: 30 }), fc.integer({ min: 0, max: 1e13 }), fc.integer({ min: 0, max: BUBBLE_SHOW_MS - 1 }), (eligible, nowMs, other) => {
        const shown = bubblesAt(eligible, nowMs);
        expect(shown.length).toBeLessThanOrEqual(2);
        expect(new Set(shown).size).toBe(shown.length);
        for (const i of shown) expect(eligible).toContain(i);
        const into = nowMs % BUBBLE_SLOT_MS;
        if (into >= BUBBLE_SHOW_MS) expect(shown).toEqual([]);
        else {
          expect(shown.length).toBe(Math.min(2, eligible.length));
          expect(bubblesAt(eligible, nowMs - into + other)).toEqual(shown);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Feature: cemetery-undead-2, Property 6: A placed Bubble is inside the Scene and clear of every name", () => {
  it("is null or a Bubble inside the Scene, sized to its line, off every name label and off what is taken, tail too", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...STATES), arbAdvisoryMode), { minLength: 1, maxLength: 60 }),
        arbSceneWidth,
        fc.nat(),
        fc.constantFrom(...Object.values(BUBBLE_LINES)),
        fc.array(fc.record({ x: fc.integer({ min: -100, max: 2000 }), y: fc.integer({ min: -100, max: 3000 }), w: fc.integer({ min: 1, max: 400 }), h: fc.integer({ min: 1, max: 200 }) }), { maxLength: 3 }),
        (rows, width, pick, line, taken) => {
          const packages = rows.map(([s, m], i) => scenePackage(`p${String(i)}`, s, m));
          const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900 });
          const placed = placeBubble(plan, pick % packages.length, line, taken);
          if (placed === null) return;
          const { rect, tailRect } = placed;
          expect(rect.w).toBeGreaterThanOrEqual(BUBBLE_MIN_W);
          expect(rect.w).toBeLessThanOrEqual(BUBBLE_MAX_W);
          expect(rect.h).toBe(bubbleHeight(line, rect.w));
          expect(rect.x).toBeGreaterThanOrEqual(0);
          expect(rect.y).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.w).toBeLessThanOrEqual(plan.width);
          expect(rect.y + rect.h).toBeLessThanOrEqual(plan.groundHeight);
          for (const g of plan.graves) {
            expect(intersects(rect, labelRect(g))).toBe(false);
            expect(intersects(tailRect, labelRect(g))).toBe(false);
          }
          for (const t of taken) {
            expect(intersects(rect, t)).toBe(false);
            expect(intersects(tailRect, t)).toBe(false);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("a Bubble keeps off other graves' art where it can", () => {
  it("never takes a place over another grave's art when a place clear of it exists", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...STATES), arbAdvisoryMode), { minLength: 1, maxLength: 40 }),
        fc.constantFrom(390, 1024, 1440),
        fc.nat(),
        (rows, width, pick) => {
          const packages = rows.map(([s, m], i) => scenePackage(`p${String(i)}`, s, m));
          const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900 });
          const index = pick % packages.length;
          const line = "Two years without a release. Getting restless.";
          const placed = placeBubble(plan, index, line, []);
          if (placed === null) return;
          const others = plan.graves.filter((g) => g.index !== index).flatMap((g) => formRects(g));
          const covers = others.some((r) => intersects(placed.rect, r));
          if (!covers) return;
          // It covers other art only when every allowed place does.
          const grave = plan.graves[index];
          if (grave === undefined) return;
          for (const c of bubbleCandidates(grave, line, plan.width)) {
            const inScene = c.rect.x >= 0 && c.rect.y >= 0 && c.rect.x + c.rect.w <= plan.width && c.rect.y + c.rect.h <= plan.groundHeight;
            const clearOfNames = plan.graves.every((g) => !intersects(c.rect, labelRect(g)) && !intersects(c.tailRect, labelRect(g)));
            if (inScene && clearOfNames) expect(others.some((r) => intersects(c.rect, r))).toBe(true);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Feature: cemetery-undead-2, Property 9: Every Bubble's tail ends inside its speaker's cell", () => {
  it("ends each tail inside the speaking grave's cell, touching its Bubble, at every instant", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...STATES), arbAdvisoryMode), { minLength: 1, maxLength: 60 }),
        fc.constantFrom(390, 768, 1280, 1440, 1920),
        fc.integer({ min: 0, max: 1e12 }),
        (rows, width, nowMs) => {
          const packages = rows.map(([s, m], i) => scenePackage(`p${String(i)}`, s, m));
          const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900 });
          const lines = packages.map((_, i) => Object.values(BUBBLE_LINES)[i % 10] ?? null);
          for (const b of bubblesFor(plan, lines, nowMs)) {
            const cell = plan.graves[b.index]?.rect;
            expect(cell).toBeDefined();
            if (cell === undefined) continue;
            expect(b.tail.x).toBeGreaterThanOrEqual(cell.x);
            expect(b.tail.x).toBeLessThanOrEqual(cell.x + cell.w);
            expect(b.tail.y).toBeGreaterThanOrEqual(cell.y);
            expect(b.tail.y).toBeLessThanOrEqual(cell.y + cell.h);
            // The tail's base sits on its Bubble's edge.
            const t = b.tailRect;
            const r = b.rect;
            if (b.tail.side === "down") expect(t.y).toBeCloseTo(r.y + r.h, 6);
            if (b.tail.side === "left") expect(t.x + t.w).toBeCloseTo(r.x, 6);
            if (b.tail.side === "right") expect(t.x).toBeCloseTo(r.x + r.w, 6);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("the Bubbles and the tooltip", () => {
  it("gives the hovered or focused grave no Bubble, and keeps every Bubble out of the band where its tooltip opens", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...STATES), { minLength: 1, maxLength: 20 }), fc.nat(), fc.integer({ min: 0, max: 1e12 }), (states, pick, nowMs) => {
        const packages = states.map((st, i) => scenePackage(`p${String(i)}`, st, "none"));
        const lantern = pick % packages.length;
        const plan = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900, lantern });
        const lines = packages.map(() => "Still kicking. The party hat stays on.");
        const g = plan.graves[lantern];
        if (g === undefined) return;
        const band = { x: g.rect.x - 248, y: g.rect.y, w: g.rect.w + 496, h: g.rect.h };
        for (const b of bubblesFor(plan, lines, nowMs)) {
          expect(b.index).not.toBe(lantern);
          expect(intersects(b.rect, band)).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("the Bubble layer (requirements 7.5 to 7.8)", () => {
  const packages = [scenePackage("a", "Dead", "none"), scenePackage("b", "Restless", "none"), scenePackage("c", "Alive", "none")].map((p, i) => ({
    ...p,
    stateReason: ["installed version is deprecated", "advisory of severity Moderate or Low", "no rule matched"][i] ?? "",
  }));
  const plan = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900 });
  const lines = bubbleLines(packages, undefined);

  it("shows two Bubbles, aria-hidden, at the start of a slot, and none at its end", () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const { container } = render(<Bubbles plan={plan} lines={lines} hidden={false} reducedMotion={false} />);
      const layer = container.querySelector(".bubble-layer");
      expect(layer?.getAttribute("aria-hidden")).toBe("true");
      expect(container.querySelectorAll(".bubble")).toHaveLength(bubblesFor(plan, lines, 0).length);
      expect(container.querySelectorAll(".bubble").length).toBe(2);
      // One timer at a time: to the fade, then to the show boundary.
      act(() => {
        vi.advanceTimersByTime(BUBBLE_SHOW_MS - 200);
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(container.querySelectorAll(".bubble")).toHaveLength(0);
      act(() => {
        vi.advanceTimersByTime(BUBBLE_SLOT_MS - BUBBLE_SHOW_MS);
      });
      expect(container.querySelectorAll(".bubble")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the clock afresh when shown again, so a stale slot never shows (review, task 8)", () => {
    vi.useFakeTimers({ now: 1_000 });
    try {
      const { container, rerender } = render(<Bubbles plan={plan} lines={lines} hidden={true} reducedMotion={false} />);
      act(() => {
        vi.advanceTimersByTime(4_000);
      });
      rerender(<Bubbles plan={plan} lines={lines} hidden={false} reducedMotion={false} />);
      expect(container.querySelectorAll(".bubble")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows nothing when hidden (Serious mode or the drawer open)", () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const { container } = render(<Bubbles plan={plan} lines={lines} hidden={true} reducedMotion={false} />);
      expect(container.querySelector(".bubble")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("has no transition under Reduced motion, and fades without it", () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const { container, rerender } = render(<Bubbles plan={plan} lines={lines} hidden={false} reducedMotion={true} />);
      for (const b of container.querySelectorAll(".bubble")) expect(b.classList.contains("bubble-still")).toBe(true);
      rerender(<Bubbles plan={plan} lines={lines} hidden={false} reducedMotion={false} />);
      for (const b of container.querySelectorAll(".bubble")) expect(b.classList.contains("bubble-still")).toBe(false);
      act(() => {
        vi.advanceTimersByTime(BUBBLE_SHOW_MS - 100);
      });
      for (const b of container.querySelectorAll(".bubble")) expect(b.classList.contains("bubble-leaving")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
