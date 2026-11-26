// Spec cemetery-undead-2, requirement 1: no grave covers another grave's name.
import type { PackageHealth } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateScanResponse } from "../src/load/validate-scan-response.js";
import { ART_BOX, artRect, FORM_BOX, FORM_PARTS, GHOST_BOX, intersects, LABEL_BOX, labelRect, MARKER_BOX } from "../src/scene/art-box.js";
import { drawGrave } from "../src/scene/draw.js";
import { CELL_HEIGHT, CELL_WIDTH, GHOST_STEPS, GRAVE_GEOMETRY, ghostOffset, planScene, REPLAY_SCALE, type GravePlan, type Rect, type ScenePlan } from "../src/scene/layout.js";
import { PALETTE } from "../src/scene/palette.js";
import type { ShapeId } from "../src/scene/shapes.js";
import { triageOrder } from "../src/triage/triage.js";
import { at, arbScenePackages, arbSceneWidth } from "./arbitraries.js";
import { BoundsContext, unionOf, type Box } from "./bounds-context.js";
import { readDemoScan } from "./support/demo-scan.js";

const NUM_RUNS = 100;
const SHAPES: readonly ShapeId[] = ["rounded", "tilted", "cross", "cracked", "open", "unmarked"];
/** The Tier scales and the replay scale (design.md A1). */
export const PROBE_SCALES: readonly number[] = [0.64, 0.8, 1, REPLAY_SCALE];
/** A small rounding slack: the probe works in floating point. */
const EPS = 1e-6;

const BASE_PLAN: ScenePlan = planScene({ packages: [], width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 });
const DECO = { shadow: PALETTE.dark.pit + "2e", stone: PALETTE.dark.ink + "33" };

export interface ProbeGrave {
  readonly shape: ShapeId;
  readonly scale: number;
  readonly ghostPhase: number | null;
  readonly marker: boolean;
  readonly burial: number | null;
}

/** Draws one grave at the origin and returns every mark's box in cell units. */
export function probeGrave(g: ProbeGrave, nowMs: number, plan: ScenePlan = BASE_PLAN, extra?: (grave: GravePlan) => GravePlan, noShadow = false): Box[] {
  const s = g.scale;
  const rect: Rect = { x: 0, y: 0, w: CELL_WIDTH * s, h: CELL_HEIGHT * s };
  let grave: GravePlan = {
    dimmed: false,
    index: 0,
    name: "probe",
    state: "Alive",
    rect,
    shape: g.shape,
    fill: PALETTE.dark.states.Alive,
    ghost: g.ghostPhase === null || g.shape === "unmarked" ? null : { x: GRAVE_GEOMETRY.ghostX * s, y: GRAVE_GEOMETRY.ghostTop * s + ghostOffset(g.ghostPhase) },
    inscription: "abcdefghijklmno…",
    pending: g.shape === "unmarked",
    marker: g.marker && g.shape !== "unmarked",
    burial: g.burial,
  };
  if (extra !== undefined) grave = extra(grave);
  const ctx = new BoundsContext();
  drawGrave(ctx, grave, { ...plan, dancers: new Set(["probe"]) }, DECO, nowMs);
  return ctx.marks.filter((m) => !noShadow || m.style !== DECO.shadow).map((m) => ({ minX: m.box.minX / s, minY: m.box.minY / s, maxX: m.box.maxX / s, maxY: m.box.maxY / s }));
}

/** Every mark of one grave at the origin, in cell units, with its outline, for the Part boxes (cemetery-undead-fixes). */
export function probeMarks(g: ProbeGrave, nowMs: number): { box: Box; poly: [number, number][]; grow: number }[] {
  const s = g.scale;
  const rect: Rect = { x: 0, y: 0, w: CELL_WIDTH * s, h: CELL_HEIGHT * s };
  const grave: GravePlan = { index: 0, name: "probe", state: "Alive", rect, shape: g.shape, fill: PALETTE.dark.states.Alive, ghost: null, inscription: null, pending: g.shape === "unmarked", marker: false, burial: null, dimmed: false };
  const ctx = new BoundsContext();
  drawGrave(ctx, grave, { ...BASE_PLAN, dancers: new Set(["probe"]) }, DECO, nowMs);
  return ctx.marks
    .filter((m) => m.style !== DECO.shadow && m.kind !== "fillText")
    .map((m) => ({ box: { minX: m.box.minX / s, minY: m.box.minY / s, maxX: m.box.maxX / s, maxY: m.box.maxY / s }, poly: m.poly.map(([x, y]) => [x / s, y / s] as [number, number]), grow: m.grow / s }));
}

export function inside(box: Box, r: Rect): boolean {
  return box.minX >= r.x - EPS && box.minY >= r.y - EPS && box.maxX <= r.x + r.w + EPS && box.maxY <= r.y + r.h + EPS;
}

const arbProbe: fc.Arbitrary<ProbeGrave> = fc.record({
  shape: fc.constantFrom(...SHAPES),
  scale: fc.constantFrom(...PROBE_SCALES),
  ghostPhase: fc.option(fc.integer({ min: 0, max: GHOST_STEPS - 1 }), { nil: null }),
  marker: fc.boolean(),
  burial: fc.constant(null),
});

describe("Feature: cemetery-undead-2, Property 1: No grave covers another grave's name", () => {
  it("keeps every Art box off every other grave's name label, inside its own vertical band and 40 units past its sides", () => {
    fc.assert(
      fc.property(
        arbScenePackages([1, 2, 7, 8, 9, 12, 20, 59, 60, 61, 300]),
        arbSceneWidth,
        fc.oneof(fc.integer({ min: -100, max: 3000 }), fc.constant(Number.NaN)),
        fc.boolean(),
        fc.boolean(),
        (packages, width, fit, replay, frontFirst) => {
          // Spec clean-site, task 11: the fit scale and the front-first Narrow layout keep every name clear too.
          const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: fit, replay, frontFirst });
          const n = plan.graves.length;
          for (const g of plan.graves) {
            const art = artRect(g);
            const s = g.rect.w / CELL_WIDTH;
            expect(art.y).toBeGreaterThanOrEqual(g.rect.y - EPS);
            expect(art.y + art.h).toBeLessThanOrEqual(g.rect.y + g.rect.h + EPS);
            expect(art.x).toBeGreaterThanOrEqual(g.rect.x - 40 * s - EPS);
            expect(art.x + art.w).toBeLessThanOrEqual(g.rect.x + g.rect.w + 40 * s + EPS);
          }
          const limit = Math.min(n, 60);
          for (let i = 0; i < limit; i += 1) {
            const gi = at(plan.graves, i);
            for (let j = 0; j < n; j += j < 60 || n <= 60 ? 1 : 7) {
              if (i === j) continue;
              const gj = at(plan.graves, j);
              expect(intersects(artRect(gi), labelRect(gj))).toBe(false);
              expect(intersects(artRect(gj), labelRect(gi))).toBe(false);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("keeps the demo's ghosts off lodash, express and moment at 1440 and 390", () => {
    const response = validateScanResponse(readDemoScan());
    if (!response.ok) throw new Error("demo scan does not validate");
    const packages: PackageHealth[] = triageOrder(response.value.report.packages);
    for (const width of [1440, 390]) {
      const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 700 });
      for (const name of ["lodash", "express", "moment"]) {
        const target = plan.graves.find((g) => g.name === name);
        expect(target, name).toBeDefined();
        if (target === undefined) continue;
        for (const other of plan.graves) {
          if (other === target) continue;
          expect(intersects(artRect(other), labelRect(target)), `${other.name} over ${name} at ${String(width)}`).toBe(false);
        }
      }
    }
  });
});

describe("Feature: cemetery-undead-2, Property 2: Every mark of a grave lies in its Art box", () => {
  it("keeps every Form box, the Ghost box and the pennant box inside ART_BOX, and the label inside every Form box", () => {
    const asBox = (r: Rect): Box => ({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h });
    for (const shape of SHAPES) {
      expect(inside(asBox(FORM_BOX[shape]), ART_BOX), shape).toBe(true);
      expect(inside(asBox(LABEL_BOX), FORM_BOX[shape]), shape).toBe(true);
    }
    expect(inside(asBox(GHOST_BOX), ART_BOX)).toBe(true);
    expect(inside(asBox(MARKER_BOX), ART_BOX)).toBe(true);
  });

  it("draws every Form at rest, with its Ghost, pennant and every Pose, inside its Form boxes, and its shadow in the Art box", () => {
    fc.assert(
      fc.property(arbProbe, fc.integer({ min: 0, max: 24_000 }), (g, nowMs) => {
        const allowed = [FORM_BOX[g.shape], ...(g.ghostPhase !== null && g.shape !== "unmarked" ? [GHOST_BOX] : []), ...(g.marker && g.shape !== "unmarked" ? [MARKER_BOX] : [])];
        for (const box of probeGrave(g, nowMs, undefined, undefined, true)) {
          expect(allowed.some((r) => inside(box, r)), `${g.shape} at ${String(g.scale)}: ${JSON.stringify(box)}`).toBe(true);
        }
        for (const box of probeGrave(g, nowMs)) expect(inside(box, ART_BOX)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("draws every burial phase inside the Art box", () => {
    fc.assert(
      fc.property(arbProbe, fc.double({ min: 0, max: 1, noNaN: true }), (g, phase) => {
        for (const box of probeGrave({ ...g, burial: g.shape === "unmarked" ? null : phase }, 0)) expect(inside(box, ART_BOX)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("matches FORM_BOX to the measured core drawing, within 1.5 cell units, so the Halo cut is no larger than it must be", () => {
    for (const shape of SHAPES) {
      const boxes: Box[] = [];
      for (const scale of PROBE_SCALES) {
        for (let now = 0; now < 12_000; now += 125) boxes.push(...probeGrave({ shape, scale, ghostPhase: null, marker: false, burial: null }, now, undefined, undefined, true));
      }
      const u = unionOf(boxes);
      expect(u).not.toBeNull();
      if (u === null) continue;
      const f = FORM_BOX[shape];
      expect(u.minX - f.x, shape).toBeLessThan(1.5);
      expect(u.minY - f.y, shape).toBeLessThan(1.5);
      expect(f.x + f.w - u.maxX, shape).toBeLessThan(1.5);
      expect(f.y + f.h - u.maxY, shape).toBeLessThan(1.5);
    }
  });
});

describe("cemetery-undead-2, requirement 4: the pit edge colour", () => {
  it("strokes the open grave's pit edge in costume.flower and nothing near it in the lantern gold", () => {
    const ctx = new BoundsContext();
    const grave: GravePlan = {
      dimmed: false,
      index: 0,
      name: "probe",
      state: "Possessed",
      rect: { x: 0, y: 0, w: CELL_WIDTH, h: CELL_HEIGHT },
      shape: "open",
      fill: PALETTE.dark.states.Possessed,
      ghost: null,
      inscription: null,
      pending: false,
      marker: false,
      burial: null,
    };
    drawGrave(ctx, grave, BASE_PLAN, DECO, 0);
    const strokes = ctx.marks.filter((m) => m.kind === "stroke").map((m) => m.style);
    expect(strokes).toContain(PALETTE.dark.costume.flower);
    expect(strokes).not.toContain(PALETTE.dark.lantern);
    expect(strokes).not.toContain(PALETTE.dark.ring);
  });
});

/** Ray-casting point-in-polygon. */
function inPolygon(x: number, y: number, poly: readonly (readonly [number, number])[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi === undefined || pj === undefined) continue;
    if (pi[1] > y !== pj[1] > y && x < ((pj[0] - pi[0]) * (y - pi[1])) / (pj[1] - pi[1]) + pi[0]) c = !c;
  }
  return c;
}

describe("Feature: cemetery-undead-fixes, Property 2: Part boxes hold every mark of a Form", () => {
  const inParts = (shape: ShapeId, x: number, y: number): boolean =>
    FORM_PARTS[shape].some((p) => x >= p.x - EPS && x <= p.x + p.w + EPS && y >= p.y - EPS && y <= p.y + p.h + EPS);

  it("keeps every outline point, grown by its stroke, and every inner point of every mark in a Part box", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SHAPES),
        fc.constantFrom(...PROBE_SCALES),
        fc.integer({ min: 0, max: 24_000 }),
        (shape, scale, nowMs) => {
          for (const m of probeMarks({ shape, scale, ghostPhase: null, marker: false, burial: null }, nowMs)) {
            const g = m.grow;
            for (const [px, py] of m.poly) for (const dx of [-g, 0, g]) for (const dy of [-g, 0, g]) expect(inParts(shape, px + dx, py + dy), `${shape} ${String(px)},${String(py)}`).toBe(true);
            for (let x = Math.ceil(m.box.minX); x <= m.box.maxX; x += 2) {
              for (let y = Math.ceil(m.box.minY); y <= m.box.maxY; y += 2) if (inPolygon(x, y, m.poly)) expect(inParts(shape, x, y), `${shape} ${String(x)},${String(y)}`).toBe(true);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("keeps every Part box inside ART_BOX, and covers less of the cell than the core Form box for the cross and the open grave", () => {
    for (const shape of SHAPES) for (const p of FORM_PARTS[shape]) expect(inside({ minX: p.x, minY: p.y, maxX: p.x + p.w, maxY: p.y + p.h }, ART_BOX), shape).toBe(true);
    const area = (rs: readonly Rect[]): number => rs.reduce((a, q) => a + q.w * q.h, 0);
    for (const shape of ["cross", "open"] as const) expect(area(FORM_PARTS[shape])).toBeLessThan(0.8 * area([FORM_BOX[shape]]));
  });
});
