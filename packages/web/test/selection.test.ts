import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { moveSelection, reduceSelection, stepWrap } from "../src/selection/selection.js";
import { arbArrowKey, arbKeyEvent } from "./arbitraries.js";

const NO_MOD = { ctrlKey: false, altKey: false, metaKey: false };

describe("selection", () => {
  // Feature: cemetery-ui, Property 5: The selection index stays in range under any arrow-key sequence
  it("Feature: cemetery-ui, Property 5: The selection index stays in range under any arrow-key sequence", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 1, max: 20 }),
        fc.nat(400),
        fc.array(arbKeyEvent, { maxLength: 40 }),
        (count, columns, start, events) => {
          let index: number | null = count === 0 ? null : Math.min(start, count - 1);
          for (const event of events) {
            const before = index;
            const outcome = reduceSelection(index, event, columns, count);
            if (count === 0) {
              expect(outcome).toEqual({ index: null, handled: false, preventDefault: false });
            } else {
              expect(outcome.index).not.toBeNull();
              expect(Number.isInteger(outcome.index)).toBe(true);
              expect(outcome.index as number).toBeGreaterThanOrEqual(0);
              expect(outcome.index as number).toBeLessThanOrEqual(count - 1);
              // Spec clean-site, 3.23: Left and Right leave the reducer (the page moves the Selected grave with wrap).
              const arrow = event.key === "ArrowUp" || event.key === "ArrowDown";
              const modified = event.ctrlKey || event.altKey || event.metaKey;
              if (modified || !arrow) {
                expect(outcome.index).toBe(before);
                expect(outcome.handled).toBe(false);
                expect(outcome.preventDefault).toBe(false);
              } else {
                expect(outcome.handled).toBe(true);
                expect(outcome.preventDefault).toBe(true);
              }
            }
            index = outcome.index;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: cemetery-ui, Property 18: Arrow-key round trips and column changes
  it("Feature: cemetery-ui, Property 18: Arrow-key round trips and column changes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), fc.integer({ min: 1, max: 20 }), fc.nat(299), (count, columns, raw) => {
        const i = raw % count;
        if (i <= count - 2) {
          const right = moveSelection(i, "ArrowRight", columns, count);
          expect(moveSelection(right, "ArrowLeft", columns, count)).toBe(i);
        }
        if (i >= columns && i <= count - 1 - columns) {
          const up = moveSelection(i, "ArrowUp", columns, count);
          expect(moveSelection(up, "ArrowDown", columns, count)).toBe(i);
          const down = moveSelection(i, "ArrowDown", columns, count);
          expect(moveSelection(down, "ArrowUp", columns, count)).toBe(i);
        }
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        fc.nat(299),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        arbArrowKey,
        (count, raw, before, after, key) => {
          const i = raw % count;
          const other = reduceSelection(i, { key: "Shift", ...NO_MOD }, after, count);
          expect(other.index).toBe(reduceSelection(i, { key: "Shift", ...NO_MOD }, before, count).index);
          expect(other.index).toBe(i);
          // the next Up or Down uses the new column count; Left and Right leave the reducer (spec clean-site, 3.23)
          const expected = key === "ArrowUp" || key === "ArrowDown" ? moveSelection(i, key, after, count) : i;
          expect(reduceSelection(i, { key, ...NO_MOD }, after, count).index).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("leaves the index unchanged for Ctrl, Alt and Meta without preventDefault", () => {
    for (const mod of ["ctrlKey", "altKey", "metaKey"] as const) {
      const outcome = reduceSelection(3, { key: "ArrowLeft", ...NO_MOD, [mod]: true }, 4, 10);
      expect(outcome).toEqual({ index: 3, handled: false, preventDefault: false });
    }
  });

  it("leaves Left and Right to the page, which wraps at the ends in triage order (spec clean-site, 3.23)", () => {
    expect(reduceSelection(3, { key: "ArrowLeft", ...NO_MOD }, 4, 10)).toEqual({ index: 3, handled: false, preventDefault: false });
    expect(reduceSelection(3, { key: "ArrowRight", ...NO_MOD }, 4, 10)).toEqual({ index: 3, handled: false, preventDefault: false });
    expect(stepWrap(0, "ArrowLeft", 10)).toBe(9);
    expect(stepWrap(9, "ArrowRight", 10)).toBe(0);
    expect(stepWrap(4, "ArrowRight", 10)).toBe(5);
    expect(stepWrap(null, "ArrowRight", 10)).toBe(1);
    expect(stepWrap(3, "ArrowLeft", 0)).toBeNull();
  });

  it("does not handle non-arrow keys", () => {
    expect(reduceSelection(2, { key: "a", ...NO_MOD }, 4, 10)).toEqual({ index: 2, handled: false, preventDefault: false });
    expect(moveSelection(2, "Enter", 4, 10)).toBe(2);
  });

  it("handles count 0 and clamps at the edges without wrap", () => {
    expect(reduceSelection(null, { key: "ArrowRight", ...NO_MOD }, 4, 0)).toEqual({ index: null, handled: false, preventDefault: false });
    expect(moveSelection(0, "ArrowLeft", 4, 10)).toBe(0);
    expect(moveSelection(9, "ArrowRight", 4, 10)).toBe(9);
    expect(moveSelection(1, "ArrowUp", 4, 10)).toBe(0);
    expect(moveSelection(8, "ArrowDown", 4, 10)).toBe(9);
    expect(moveSelection(5, "ArrowDown", 0, 10)).toBe(6);
  });
});
