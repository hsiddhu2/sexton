import type { PackageHealth, State } from "@sexton/api";
import { cleanup, fireEvent, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { graveLabel } from "../src/overlay/grave-label.js";
import { planScene } from "../src/scene/layout.js";
import { triageOrder } from "../src/triage/triage.js";
import { arbGraveCount, cheapScan, scenePackage, type AdvisoryMode } from "./arbitraries.js";

afterEach(cleanup);

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button[data-grave-index]")];
}

describe("grave buttons", () => {
  // Feature: cemetery-ui, Property 4: The focusable grave count equals the package count
  it("Feature: cemetery-ui, Property 4: The focusable grave count equals the package count", () => {
    fc.assert(
      fc.property(arbGraveCount, (count) => {
        const response = cheapScan(count);
        const { container, unmount } = render(<Cemetery response={response} theme="light" reducedMotion={true} />);
        const list = buttons(container);
        expect(list).toHaveLength(count);
        const order = triageOrder(response.report.packages);
        list.forEach((button, i) => {
          expect(button.getAttribute("aria-label")).toBe(graveLabel(order[i] as PackageHealth));
          expect(button.getAttribute("tabindex")).toBe(i === 0 ? "0" : "-1");
        });
        expect(list.filter((b) => b.tabIndex === 0)).toHaveLength(count === 0 ? 0 : 1);
        unmount();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: cemetery-ui, Property 16: The grave label has the stated form
  it("Feature: cemetery-ui, Property 16: The grave label has the stated form", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.constantFrom<AdvisoryMode>("none", "some", "unavailable"),
        fc.constantFrom<State>("Alive", "Restless", "Haunted", "Dead", "Possessed"),
        fc.integer({ min: 0, max: 5 }),
        (name, mode, state, n) => {
          const pkg = scenePackage(name, state, mode);
          if (mode === "some") {
            const advisories = Array.from({ length: Math.max(1, n) }, (_, i) => ({ id: `G-${String(i)}`, severity: "Low", summary: "s" }));
            (pkg.signals.advisories as { value: unknown }).value = advisories;
            const suffix = advisories.length === 1 ? ", 1 advisory" : `, ${String(advisories.length)} advisories`;
            expect(graveLabel(pkg)).toBe(`${name} 1.0.0, ${state}${suffix}`);
          } else {
            expect(graveLabel(pkg)).toBe(`${name} 1.0.0, ${state}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("moves focus with an arrow key, does not open anything, and prevents default", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="light" reducedMotion={true} />);
    const list = buttons(container);
    list[0]?.focus();
    const notPrevented = fireEvent.keyDown(list[0] as HTMLElement, { key: "ArrowRight" });
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(list[1]);
    expect(buttons(container).map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("clamps at the edges", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="light" reducedMotion={true} />);
    const list = buttons(container);
    list[0]?.focus();
    fireEvent.keyDown(list[0] as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(list[0]);
  });

  it("does not prevent default or move focus for Alt+ArrowLeft", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="light" reducedMotion={true} />);
    const list = buttons(container);
    list[1]?.focus();
    const result = fireEvent.keyDown(list[1] as HTMLElement, { key: "ArrowLeft", altKey: true });
    expect(result).toBe(true);
    expect(document.activeElement).toBe(list[1]);
  });

  it("click selects the button, and a click outside any button changes nothing", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="light" reducedMotion={true} />);
    const list = buttons(container);
    fireEvent.click(list[2] as HTMLElement);
    expect(buttons(container).map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
    const canvas = container.querySelector("canvas") as HTMLElement;
    fireEvent.click(canvas);
    fireEvent.click(container.querySelector(".overlay") as HTMLElement);
    expect(buttons(container).map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("renders no button for zero packages", () => {
    const { container } = render(<Cemetery response={cheapScan(0)} theme="light" reducedMotion={true} />);
    expect(buttons(container)).toHaveLength(0);
  });
});

describe("Feature: cemetery-theme, Property 8: Overlay buttons follow the plan", () => {
  it("gives each button the rectangle of its grave", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), (count) => {
        const response = cheapScan(count);
        const { container, unmount } = render(<Cemetery response={response} theme="light" reducedMotion={true} />);
        // jsdom reports no container width, so the layout clamps to the minimum width.
        const plan = planScene({ packages: triageOrder(response.report.packages), width: 0, theme: "light", selectedIndex: null, ghostPhase: 0 });
        const list = buttons(container);
        expect(list).toHaveLength(count);
        list.forEach((button, i) => {
          const rect = plan.graves[i]?.rect;
          expect([button.style.left, button.style.top, button.style.width, button.style.height]).toEqual([
            `${String(rect?.x)}px`,
            `${String(rect?.y)}px`,
            `${String(rect?.w)}px`,
            `${String(rect?.h)}px`,
          ]);
        });
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
