// Spec cemetery-undead, task 6.3: Serious mode (requirement 8). Property 5, and the toggle in the page.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { readSerious, SERIOUS_KEY, writeSerious } from "../src/epitaph/serious.js";
import { readDemoScanText } from "./support/demo-scan.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe("Feature: cemetery-undead, Property 5: Serious mode storage is total", () => {
  it("Feature: cemetery-undead, Property 5: Serious mode storage is total", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant("on"), fc.constant("off"), fc.constant(null)), fc.boolean(), (stored, b) => {
        const s = memory();
        if (stored !== null) s.setItem(SERIOUS_KEY, stored);
        expect(readSerious(s)).toBe(stored === "on");
        writeSerious(s, b);
        expect(readSerious(s)).toBe(b);
        const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
        expect(readSerious(throwing)).toBe(false);
        expect(() => { writeSerious(throwing, b); }).not.toThrow();
        expect(readSerious(null)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("the Serious mode toggle", () => {
  const mount = () =>
    render(
      <App
        fetchFn={(() => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as typeof fetch}
        apiBase={null}
        initialSearch=""
        pageOrigin="http://localhost"
      />,
    );
  const ready = () => waitFor(() => { expect(screen.queryByRole("status")).toBeNull(); });
  const grave = (name: string): HTMLElement => document.querySelector<HTMLElement>(`button[data-grave-index][aria-label^="${name} "]`) as HTMLElement;

  it("is a native toggle off by default; on, it hides the Punchline in the tooltip and drawer and keeps the reason; it persists", async () => {
    mount();
    await ready();
    const toggle = screen.getByRole("button", { name: "Serious mode" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.pointerEnter(grave("left-padder"));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Here lies left-padder");
    expect(tip.textContent).toContain("maintainer change in the last 90 days");
    expect(tip.textContent).toContain("The keys changed hands. Nobody heard the door.");
    fireEvent.pointerLeave(grave("left-padder"));
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem(SERIOUS_KEY)).toBe("on");
    fireEvent.pointerEnter(grave("left-padder"));
    const serious = screen.getByRole("tooltip");
    expect(serious.textContent).toContain("maintainer change in the last 90 days");
    expect(serious.textContent).not.toContain("The keys changed hands");
    fireEvent.click(grave("left-padder"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Here lies");
    expect(dialog.textContent).toContain("Reason: maintainer change in the last 90 days");
    expect(dialog.querySelector(".epitaph-punchline")).toBeNull();
    cleanup();
    mount();
    await ready();
    expect(screen.getByRole("button", { name: "Serious mode" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the Punchline in the drawer when Serious mode is off", async () => {
    mount();
    await ready();
    fireEvent.click(grave("left-padder"));
    expect(screen.getByRole("dialog").querySelector(".epitaph-punchline")?.textContent).toBe("The keys changed hands. Nobody heard the door.");
  });

  it("shows no Here lies and no Punchline for a grave not yet published on the chosen date", async () => {
    const { container } = render(
      <App
        fetchFn={(() => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as typeof fetch}
        apiBase={null}
        initialSearch=""
        pageOrigin="http://localhost"
      />,
    );
    await ready();
    fireEvent.change(screen.getByRole("slider", { name: "History date" }), { target: { value: "0" } });
    const pending = [...container.querySelectorAll<HTMLElement>("button[data-grave-index]")].find((b) => (b.getAttribute("aria-label") ?? "").includes("not yet published"));
    expect(pending).toBeDefined();
    if (pending === undefined) return;
    fireEvent.pointerEnter(pending);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).not.toContain("Here lies");
    expect(tip.querySelector(".epitaph-punchline")).toBeNull();
  });
});
