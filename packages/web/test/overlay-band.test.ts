// Spec clean-site, design C3: the help line and the date badge sit in the sky band, clear of every Art box (2.12).
import type { ScanResponse } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { artRect, intersects } from "../src/scene/art-box.js";
import { planScene } from "../src/scene/layout.js";
import { OVERLAY_BAND, OVERLAY_HEIGHT, OVERLAY_TOP, overlayRects } from "../src/scene/overlay-band.js";
import { stopsFor } from "../src/time/stops.js";
import { formAt, timelineOf } from "../src/time/form-at.js";
import { cheapScan } from "./arbitraries.js";
import { readReplay } from "./support/replay-fixture.js";

// The first half of Property 8; the Tour card half lands with tour/place-card.ts (task 7.3), and frontFirst with
// task 11.
describe("Feature: clean-site, Property 8: Overlays clear the graves, and the Tour card fits", () => {
  it("keeps the help line and the date badge clear of every Art box for 1 to 300 packages at 320 to 1600 px", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), fc.integer({ min: 320, max: 1600 }), fc.integer({ min: 0, max: 1200 }), (n, width, fit) => {
        const plan = planScene({ packages: cheapScan(n).report.packages, width, theme: "dark", selectedIndex: 0, ghostPhase: 0, fitHeight: fit });
        const { help, badge } = overlayRects(plan.width);
        for (const g of plan.graves) {
          expect(intersects(help, artRect(g))).toBe(false);
          expect(intersects(badge, artRect(g))).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("keeps the date badge clear of a replay's one grave at each Step of both fixtures", () => {
    for (const id of ["axios", "keyv"] as const) {
      const response = readReplay(id) as ScanResponse;
      const pkg = response.report.packages[0];
      if (pkg === undefined) throw new Error("no package");
      for (const ms of stopsFor(response).stops) {
        for (const width of [320, 390, 700, 1100, 1440, 1600]) {
          const form = formAt(timelineOf(response, pkg.name), ms, { state: pkg.state, reason: pkg.stateReason, ghost: false });
          const plan = planScene({ packages: [pkg], width, theme: "dark", selectedIndex: 0, ghostPhase: 0, replay: true, forms: [form], fitHeight: 900 });
          for (const g of plan.graves) expect(intersects(overlayRects(plan.width).badge, artRect(g))).toBe(false);
        }
      }
    }
  });

  it("holds both overlays inside the band, which the sky always keeps", () => {
    expect(OVERLAY_TOP + OVERLAY_HEIGHT).toBeLessThanOrEqual(OVERLAY_BAND);
    const plan = planScene({ packages: cheapScan(1).report.packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    expect(plan.scenery.skyHeight).toBeGreaterThanOrEqual(OVERLAY_BAND);
    expect(overlayRects(1440).badge).toEqual({ x: 600, y: OVERLAY_TOP, w: 240, h: OVERLAY_HEIGHT });
    expect(overlayRects(Number.NaN).help.w).toBe(0);
  });
});
