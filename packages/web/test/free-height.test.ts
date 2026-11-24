// Spec cemetery-time-fixes, design.md "Decisions made during implementation" 6: the free height rounds up.
import { describe, expect, it } from "vitest";
import { freeHeight } from "../src/hooks/use-free-height.js";

describe("freeHeight", () => {
  it("rounds a fractional top up, so the ground reaches the bottom of the viewport", () => {
    expect(freeHeight(900, 163.6)).toBe(737);
    expect(163.6 + freeHeight(900, 163.6)).toBeGreaterThanOrEqual(900);
    expect(freeHeight(900, 164)).toBe(736);
  });

  it("gives 0 for a top below the viewport or an unreadable value", () => {
    expect(freeHeight(900, 950)).toBe(0);
    expect(freeHeight(0, 10)).toBe(0);
    expect(freeHeight(Number.NaN, 10)).toBe(0);
    expect(freeHeight(900, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
