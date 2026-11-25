// Spec cemetery-undead-fixes, bug 3: a tooltip covers no other grave's name when a place exists that avoids it.
import type { PackageHealth } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateScanResponse } from "../src/load/validate-scan-response.js";
import { STATES } from "../src/load/lists.js";
import { TOOLTIP_WIDTH, tooltipPlace, tooltipRect } from "../src/overlay/tooltip-model.js";
import { intersects, labelRect } from "../src/scene/art-box.js";
import { planScene, type Rect, type ScenePlan } from "../src/scene/layout.js";
import { triageOrder } from "../src/triage/triage.js";
import { arbAdvisoryMode, scenePackage } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

const NUM_RUNS = 100;

/** The four places of design.md, worked out here: right, left, above, over. */
function places(cell: Rect, width: number, height: number): Rect[] {
  return [
    { x: cell.x + cell.w + 8, y: cell.y + 4, w: TOOLTIP_WIDTH, h: height },
    { x: cell.x - TOOLTIP_WIDTH - 8, y: cell.y + 4, w: TOOLTIP_WIDTH, h: height },
    { x: cell.x + cell.w / 2 - TOOLTIP_WIDTH / 2, y: cell.y - height - 8, w: TOOLTIP_WIDTH, h: height },
    { x: Math.min(cell.x + 8, Math.max(0, width - TOOLTIP_WIDTH - 8)), y: cell.y + 4, w: TOOLTIP_WIDTH, h: height },
  ];
}
const insideScene = (r: Rect, plan: ScenePlan): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= plan.width && r.y + r.h <= plan.groundHeight;

function check(plan: ScenePlan, index: number, height: number): void {
  const grave = plan.graves[index];
  if (grave === undefined) return;
  const labels = plan.graves.filter((g) => g.index !== index).map((g) => labelRect(g));
  const chosen = tooltipPlace(grave.rect, { width: plan.width, height: plan.groundHeight }, height, labels);
  const rect: Rect = { x: chosen.left, y: chosen.top, w: chosen.width, h: height };
  const clear = places(grave.rect, plan.width, height).find((p) => insideScene(p, plan) && !labels.some((l) => intersects(p, l)));
  if (clear === undefined) {
    expect(chosen).toEqual(tooltipRect(grave.rect, plan.width));
    return;
  }
  expect(labels.some((l) => intersects(rect, l))).toBe(false);
  expect({ x: rect.x, y: rect.y }).toEqual({ x: clear.x, y: clear.y });
}

describe("Feature: cemetery-undead-fixes, Property 3: A tooltip covers no other name when it can avoid it", () => {
  it("takes the first of right, left, above and over that covers no other name, else today's place", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...STATES), arbAdvisoryMode), { minLength: 1, maxLength: 60 }),
        fc.constantFrom(390, 768, 1024, 1280, 1440, 1920),
        fc.nat(),
        fc.integer({ min: 80, max: 260 }),
        (rows, width, pick, height) => {
          const packages = rows.map(([s, m], i) => scenePackage(`p${String(i)}`, s, m));
          const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900 });
          check(plan, pick % packages.length, height);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("keeps event-stream's tooltip off uuid's name on the demo at 1440 by 900", () => {
    const r = validateScanResponse(readDemoScan());
    if (!r.ok) throw new Error("demo scan does not validate");
    const packages: PackageHealth[] = triageOrder(r.value.report.packages);
    const plan = planScene({ packages, width: 1440, theme: "dark", selectedIndex: 0, ghostPhase: 0, fitHeight: 721 });
    const index = plan.graves.findIndex((g) => g.name === "event-stream");
    expect(index).toBeGreaterThanOrEqual(0);
    for (const g of plan.graves) check(plan, g.index, 172);
    const grave = plan.graves[index];
    if (grave === undefined) return;
    const chosen = tooltipPlace(grave.rect, { width: plan.width, height: plan.groundHeight }, 172, plan.graves.filter((g) => g.index !== index).map((g) => labelRect(g)));
    const uuid = plan.graves.find((g) => g.name === "uuid");
    expect(uuid).toBeDefined();
    if (uuid === undefined) return;
    expect(intersects({ x: chosen.left, y: chosen.top, w: chosen.width, h: 172 }, labelRect(uuid))).toBe(false);
  });
});
