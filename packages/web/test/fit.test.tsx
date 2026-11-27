// The scene fills the screen as in the approved design. The sky grows so the graves stand at the bottom
// above a Footer bar that stays in view, a replay's one grave is drawn full size, and a replay's Stops show as cards.
import type { PackageHealth, ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { fitHeight } from "../src/hooks/use-free-height.js";
import { stopCards } from "../src/replay/stop-cards.js";
import { MAX_SKY_HEIGHT, PADDING, planScene, REPLAY_SCALE, replayCell, SKY_HEIGHT, type Rect } from "../src/scene/layout.js";
import { stopsFor } from "../src/time/stops.js";
import { at, arbSceneWidth, cheapScan } from "./arbitraries.js";
import { readReplay, readReplayText } from "./support/replay-fixture.js";

afterEach(cleanup);
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});

const NUM_RUNS = 100;
const packagesOf = (n: number): PackageHealth[] => [...cheapScan(n).report.packages];
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("Feature: cemetery-undead, Property 7: The sky fills the fit height and the graves never overlap", () => {
  it("holds for any width, fit height, replay flag and 0 to 300 packages", () => {
    fc.assert(
      fc.property(
        arbSceneWidth,
        fc.integer({ min: 0, max: 300 }),
        fc.oneof(fc.integer({ min: -100, max: 3000 }), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY)),
        fc.boolean(),
        (width, n, fit, replay) => {
          const plain = planScene({ packages: packagesOf(n), width, theme: "dark", selectedIndex: null, ghostPhase: 0 });
          const plan = planScene({ packages: packagesOf(n), width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: fit, replay });
          if (n === 0) {
            expect(plan.height).toBe(0);
            return;
          }
          const sky = plan.scenery.skyHeight;
          expect(sky).toBeGreaterThanOrEqual(SKY_HEIGHT);
          expect(sky).toBeLessThanOrEqual(MAX_SKY_HEIGHT);
          expect(plan.scenery.horizonY).toBe(sky);
          const lone = n === 1 && replay;
          // Spec clean-site, task 11: when the graves do not fit at full size but fit at a smaller fit scale, all of
          // them shrink together and the plan fits the fit height; otherwise the sky only moves them down.
          const scaled = !lone && plan.graves.some((g, i) => g.rect.w !== at(plain.graves, i).rect.w);
          if (scaled) {
            expect(plan.height).toBeLessThanOrEqual(Math.floor(fit));
            for (const [i, g] of plan.graves.entries()) expect(g.rect.w).toBeLessThan(at(plain.graves, i).rect.w);
          }
          if (!lone && !scaled) {
            // The sky only moves the graves down: every rectangle keeps its size and its x.
            const shift = sky - SKY_HEIGHT;
            plan.graves.forEach((g, i) => {
              const p = at(plain.graves, i).rect;
              expect(g.rect).toEqual({ x: p.x, y: p.y + shift, w: p.w, h: p.h });
            });
            expect(plan.height).toBe(plain.height + shift);
          }
          // When the graves fit, they end PADDING above the fit height.
          if (Number.isFinite(fit) && fit - (plan.height - sky) >= SKY_HEIGHT && fit - (plan.height - sky) <= MAX_SKY_HEIGHT) {
            expect(plan.height).toBe(Math.floor(fit));
          }
          for (const g of plan.graves) {
            expect(g.rect.x).toBeGreaterThanOrEqual(0);
            expect(g.rect.x + g.rect.w).toBeLessThanOrEqual(plan.width);
            expect(g.rect.y).toBeGreaterThanOrEqual(sky);
            expect(g.rect.y + g.rect.h).toBeLessThanOrEqual(plan.height - PADDING);
          }
          const limit = Math.min(n, 60);
          for (let i = 0; i < limit; i += 1) {
            for (let j = i + 1; j < n; j += n <= 60 ? 1 : 7) expect(overlap(at(plan.graves, i).rect, at(plan.graves, j).rect)).toBe(false);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("stands the demo's graves at the bottom of a 1440 by 900 screen", () => {
    // 900 high, a 120 px header and a 57 px Footer bar leave a fit height of 723.
    const plan = planScene({ packages: packagesOf(12), width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 723 });
    expect(plan.height).toBe(723);
    expect(plan.scenery.skyHeight).toBeGreaterThan(SKY_HEIGHT);
  });
});

describe("a replay's one grave is drawn full size (requirement 5.8)", () => {
  it("scales the lone grave by REPLAY_SCALE when it fits, and centres it", () => {
    const pkg = packagesOf(1);
    const plan = planScene({ packages: pkg, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900, replay: true });
    const rect = at(plan.graves, 0).rect;
    expect([rect.w, rect.h]).toEqual([Math.floor(192 * REPLAY_SCALE), Math.floor(224 * REPLAY_SCALE)]);
    expect(rect.x).toBe(PADDING + Math.floor((1440 - 2 * PADDING - rect.w) / 2));
  });

  it("fits the width and the fit height, and never goes below the normal size", () => {
    // The width leaves room for the lid: 60 cell units each side.
    expect(replayCell(800, 900)).toEqual({ w: Math.floor(192 * 1.8), h: Math.floor(224 * 1.8) });
    expect(replayCell(390, 900)).toEqual({ w: Math.floor(192 * (358 / 312)), h: Math.floor(224 * (358 / 312)) });
    expect(replayCell(1440, 400)).toEqual({ w: Math.floor(192 * ((400 - 120 - 32) / 224)), h: Math.floor(224 * ((400 - 120 - 32) / 224)) });
    expect(replayCell(224, 100)).toEqual({ w: 192, h: 224 });
  });

  it("keeps the normal Tier cell when the scene is not a replay or holds more than one grave", () => {
    const one = planScene({ packages: packagesOf(1), width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900 });
    expect(at(one.graves, 0).rect.w).toBeLessThanOrEqual(192);
    const two = planScene({ packages: packagesOf(2), width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900, replay: true });
    for (const g of two.graves) expect(g.rect.w).toBeLessThanOrEqual(192);
  });
});

describe("the fit height", () => {
  it("is the free height less a pinned Footer bar, else 0", () => {
    expect(fitHeight(780, 57, true)).toBe(723);
    expect(fitHeight(780, 57, false)).toBe(0);
    expect(fitHeight(0, 57, true)).toBe(0);
    expect(fitHeight(Number.NaN, 57, true)).toBe(0);
    expect(fitHeight(50, 57, true)).toBe(0);
  });
});

describe("the replay Stop cards in the Footer bar", () => {
  it("gives each Stop of the axios replay its version and State", () => {
    const response = readReplay("axios") as ScanResponse;
    const info = stopsFor(response);
    expect(stopCards(response, info.stops)).toEqual([
      { name: "axios", version: "1.14.0", state: "Alive" },
      { name: "axios", version: "1.14.1", state: "Possessed" },
      { name: "axios", version: "1.14.0", state: "Alive" },
    ]);
  });

  it("gives no cards for a response that is not a replay", () => {
    const scan = cheapScan(1);
    expect(stopCards(scan, [0])).toBeNull();
  });

  // Spec clean-site, task 6.3: the Footer bar of a Replay shows Step cards (number and title) and the Step panel and
  // date badge follow the pressed card; the scrubber, its captions and the card over the scene went (8.8, 8.22).
  it("shows three Step cards, marks the current one and moves the Step panel and date badge when one is pressed", async () => {
    const fetchFn = ((): Promise<Response> => Promise.resolve(new Response(readReplayText("axios"), { status: 200 }))) as unknown as typeof fetch;
    const { container } = render(<App fetchFn={fetchFn} apiBase={null} initialSearch="?replay=axios" pageOrigin="http://localhost" />);
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    const footer = container.querySelector("footer.replay-foot") as HTMLElement;
    const cards = [...footer.querySelectorAll<HTMLButtonElement>(".step-card")];
    expect(cards.map((c) => c.textContent)).toEqual(["Step 1A normal day", "Step 2A poisoned release appears", "Step 3npm removes the bad release"]);
    expect(cards.map((c) => c.getAttribute("aria-current"))).toEqual(["step", null, null]);
    fireEvent.click(cards[1] as HTMLButtonElement);
    expect(container.querySelector(".scene-card .date-badge")?.textContent).toBe("31 Mar 2026, 00:21 UTC");
    expect([...footer.querySelectorAll(".step-card")].map((c) => c.getAttribute("aria-current"))).toEqual([null, "step", null]);
    expect(container.querySelector(".step-panel .badge")?.textContent).toBe("axios 1.14.1 is Possessed");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(container.querySelector(".replay-card")).toBeNull();
    expect(container.querySelectorAll(".scrub-note")).toHaveLength(0);
  });
});
