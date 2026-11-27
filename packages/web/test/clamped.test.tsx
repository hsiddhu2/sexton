// Spec clean-site, requirement 3.26: a clamped box keeps its whole text in the DOM, and while styles.css cuts it short
// its title holds the whole text too.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Clamped, isCut } from "../src/panel/Clamped.js";

afterEach(() => {
  cleanup();
});

/** Gives every element of the page the scroll and client sizes given, for the length of one render. */
function withSizes(sizes: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }, run: () => void): void {
  const saved = Object.keys(sizes).map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const);
  for (const [key, value] of Object.entries(sizes)) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
  try {
    run();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, key);
      else Object.defineProperty(HTMLElement.prototype, key, descriptor);
    }
  }
}

describe("Clamped (3.26)", () => {
  it("counts a box as cut when its content is wider or taller than the box, by more than a pixel", () => {
    expect(isCut({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 40 })).toBe(false);
    expect(isCut({ scrollWidth: 101, clientWidth: 100, scrollHeight: 40, clientHeight: 40 })).toBe(false);
    expect(isCut({ scrollWidth: 140, clientWidth: 100, scrollHeight: 40, clientHeight: 40 })).toBe(true);
    expect(isCut({ scrollWidth: 100, clientWidth: 100, scrollHeight: 60, clientHeight: 40 })).toBe(true);
  });

  it("keeps the whole text in the DOM and gives a cut box the whole text as its title", () => {
    const text = "No release in 24 months, and a known advisory is still open.";
    withSizes({ scrollWidth: 300, clientWidth: 300, scrollHeight: 69, clientHeight: 46 }, () => {
      const view = render(<Clamped className="inspector-why" text={text} />);
      const box = view.container.querySelector("p.inspector-why");
      expect(box?.textContent).toBe(text);
      expect(box?.getAttribute("title")).toBe(text);
    });
  });

  it("gives a box that shows all of its text no title, and renders the children it is given", () => {
    withSizes({ scrollWidth: 300, clientWidth: 300, scrollHeight: 23, clientHeight: 23 }, () => {
      const view = render(
        <Clamped as="b" className="signal-value-ok" text="alice, mallory">
          <i>alice, mallory</i>
        </Clamped>,
      );
      const box = view.container.querySelector("b.signal-value-ok");
      expect(box?.querySelector("i")?.textContent).toBe("alice, mallory");
      expect(box?.hasAttribute("title")).toBe(false);
    });
  });
});
