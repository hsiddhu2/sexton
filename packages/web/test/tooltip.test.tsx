import type { State } from "@sexton/api";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { GRACE_MS, TIP_START, tipReducer, tooltipContent, tooltipRect, type TipEvent, type TipState } from "../src/overlay/tooltip-model.js";
import { arbAdvisoryMode, arbName, arbState, cheapScan, scenePackage } from "./arbitraries.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const arbEvent: fc.Arbitrary<TipEvent> = fc.oneof(
  fc.integer({ min: 0, max: 3 }).map((index): TipEvent => ({ type: "pointer-enter", index })),
  fc.integer({ min: 0, max: 3 }).map((index): TipEvent => ({ type: "pointer-leave", index })),
  fc.integer({ min: 0, max: 3 }).map((index): TipEvent => ({ type: "focus", index })),
  fc.integer({ min: 0, max: 3 }).map((index): TipEvent => ({ type: "blur", index })),
  fc.constantFrom<TipEvent>({ type: "tip-enter" }, { type: "tip-leave" }, { type: "escape" }, { type: "grace-expired" }),
);

describe("tooltip model", () => {
  it("Feature: cemetery-polish, Property 11: Tooltip content matches the package", () => {
    fc.assert(
      fc.property(arbName, arbState, arbAdvisoryMode, fc.integer({ min: 1, max: 6 }), (name, state: State, mode, n) => {
        const pkg = scenePackage(name, state, mode);
        if (mode === "some") {
          (pkg.signals.advisories as { value: unknown }).value = Array.from({ length: n }, (_, i) => ({ id: `G-${String(i)}`, severity: "Low", summary: "s" }));
        }
        const c = tooltipContent(pkg);
        expect([c.name, c.version, c.state, c.reason]).toEqual([pkg.name, pkg.installedVersion, pkg.state, pkg.stateReason]);
        if (mode === "unavailable") {
          expect(c.advisoryText).toBe("advisories unavailable");
          expect(c.advisoryCount).toBeNull();
        } else if (mode === "none") {
          expect(c.advisoryText).toBe("no advisories");
          expect(c.advisoryCount).toBe(0);
        } else {
          expect(c.advisoryText).toBe(n === 1 ? "1 advisory" : `${String(n)} advisories`);
          expect(c.advisoryCount).toBe(n);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("positions the tooltip at offset (8, 4) with width 176", () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 5000 }), fc.integer({ min: -50, max: 5000 }), (x, y) => {
        expect(tooltipRect({ x, y, w: 192, h: 224 })).toEqual({ left: x + 8, top: y + 4, width: 176 });
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-polish, Property 12: The tooltip state machine", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 40 }), (events) => {
        let state: TipState = TIP_START;
        for (const event of events) {
          const next = tipReducer(state, event);
          // Deterministic, and one index at most by construction.
          expect(tipReducer(state, event)).toEqual(next);
          if (event.type === "escape") expect(next).toEqual(TIP_START);
          if (event.type === "pointer-enter") expect(next).toMatchObject({ index: event.index, source: "pointer" });
          if (event.type === "focus") expect(next).toMatchObject({ index: event.index, source: "focus" });
          if (event.type === "blur" && state.source === "focus" && state.index === event.index) expect(next.index).toBeNull();
          if (event.type === "blur" && !(state.source === "focus" && state.index === event.index)) expect(next).toEqual(state);
          if (event.type === "grace-expired") {
            const hides = state.leaving && !state.overTip && state.source === "pointer";
            expect(next.index === null).toBe(hides || state.index === null);
          }
          if (event.type === "tip-enter" && state.index !== null) expect(next).toMatchObject({ index: state.index, overTip: true, leaving: false });
          // A hidden state only changes on pointer-enter or focus.
          if (state.index === null && event.type !== "pointer-enter" && event.type !== "focus") expect(next).toEqual(TIP_START);
          // Pointer leaving never hides at once.
          if (event.type === "pointer-leave") expect(next.index).toBe(state.index);
          expect(next.index === null).toBe(next.source === null);
          state = next;
        }
      }),
      { numRuns: 100 },
    );
  });
});

function tips(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="tooltip"]')];
}
function graves(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button[data-grave-index]")];
}

describe("tooltip in the cemetery", () => {
  it("focus shows the five facts, role and aria-describedby", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="dark" reducedMotion={true} />);
    const list = graves(container);
    expect(tips(container)).toHaveLength(0);
    act(() => {
      list[0]?.focus();
    });
    const found = tips(container);
    expect(found).toHaveLength(1);
    const tip = found[0] as HTMLElement;
    expect(tip.id).toBe("grave-tooltip");
    expect(list[0]?.getAttribute("aria-describedby")).toBe("grave-tooltip");
    expect(list[1]?.hasAttribute("aria-describedby")).toBe(false);
    expect(tip.textContent).toContain("pkg-");
    expect(tip.textContent).toMatch(/1\.0\.0/);
    expect(tip.textContent).toMatch(/advisor/);
  });

  it("pointer enter shows it, leave hides after the grace period, entering the tooltip keeps it", () => {
    vi.useFakeTimers();
    const { container } = render(<Cemetery response={cheapScan(3)} theme="dark" reducedMotion={true} />);
    const list = graves(container);
    fireEvent.pointerEnter(list[1] as HTMLElement);
    expect(tips(container)).toHaveLength(1);
    fireEvent.pointerLeave(list[1] as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(GRACE_MS - 1);
    });
    expect(tips(container)).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(tips(container)).toHaveLength(0);

    fireEvent.pointerEnter(list[1] as HTMLElement);
    fireEvent.pointerLeave(list[1] as HTMLElement);
    fireEvent.pointerEnter(tips(container)[0] as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(GRACE_MS * 3);
    });
    expect(tips(container)).toHaveLength(1);
    fireEvent.pointerLeave(tips(container)[0] as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });
    expect(tips(container)).toHaveLength(0);
  });

  it("Escape hides it, a new focus shows it again, and Escape is not cancelled", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="dark" reducedMotion={true} />);
    const list = graves(container);
    act(() => {
      list[0]?.focus();
    });
    expect(tips(container)).toHaveLength(1);
    const notCancelled = fireEvent.keyDown(document.body, { key: "Escape" });
    expect(notCancelled).toBe(true);
    expect(tips(container)).toHaveLength(0);
    act(() => {
      list[0]?.blur();
      list[0]?.focus();
    });
    expect(tips(container)).toHaveLength(1);
  });

  it("blur hides a tooltip shown for focus", () => {
    const { container } = render(<Cemetery response={cheapScan(2)} theme="dark" reducedMotion={true} />);
    act(() => {
      graves(container)[0]?.focus();
    });
    act(() => {
      graves(container)[0]?.blur();
    });
    expect(tips(container)).toHaveLength(0);
  });

  it("shows no tooltip while the drawer is open", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="dark" reducedMotion={true} />);
    const list = graves(container);
    act(() => {
      list[0]?.focus();
    });
    fireEvent.click(list[0] as HTMLElement);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(tips(container)).toHaveLength(0);
    fireEvent.pointerEnter(list[1] as HTMLElement);
    expect(tips(container)).toHaveLength(0);
  });

  it("ArrowRight moves focus and the tooltip, one tooltip at a time", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="dark" reducedMotion={true} />);
    const list = graves(container);
    act(() => {
      list[0]?.focus();
    });
    fireEvent.keyDown(list[0] as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(list[1]);
    expect(tips(container)).toHaveLength(1);
    expect(list[1]?.getAttribute("aria-describedby")).toBe("grave-tooltip");
    expect(list[0]?.hasAttribute("aria-describedby")).toBe(false);
    expect(tips(container)[0]?.textContent).toContain("pkg-1");
  });

  it("renders all five facts, and scan text only as text", () => {
    const response = cheapScan(1);
    const pkg = response.report.packages[0] as unknown as { stateReason: string };
    pkg.stateReason = '<img src=x onerror="alert(1)"> **bold**';
    const { container } = render(<Cemetery response={response} theme="dark" reducedMotion={true} />);
    act(() => {
      graves(container)[0]?.focus();
    });
    const tip = tips(container)[0] as HTMLElement;
    const state = response.report.packages[0]?.state ?? "";
    expect(tip.textContent).toContain(state);
    expect(tip.textContent).toContain('<img src=x onerror="alert(1)"> **bold**');
    expect(tip.querySelector("img")).toBeNull();
    expect(tip.querySelector("strong")?.textContent).toBe("pkg-0");
  });

  it("removes the Escape listener and the grace timer on unmount", () => {
    vi.useFakeTimers();
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const keydownCalls = (spy: typeof add): number => spy.mock.calls.filter((c) => c[0] === "keydown").length;
    const { container, unmount } = render(<Cemetery response={cheapScan(2)} theme="dark" reducedMotion={true} />);
    const base = keydownCalls(add);
    fireEvent.pointerEnter(graves(container)[0] as HTMLElement);
    expect(keydownCalls(add)).toBe(base + 1);
    fireEvent.pointerLeave(graves(container)[0] as HTMLElement);
    unmount();
    expect(keydownCalls(remove)).toBeGreaterThanOrEqual(1);
    expect(vi.getTimerCount()).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });
});
