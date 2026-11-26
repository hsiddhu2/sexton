import type { PackageHealth, ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { Drawer } from "../src/drawer/Drawer.js";
import { trapStep } from "../src/drawer/focus-trap.js";
import { SIGNAL_LABELS } from "../src/drawer/signal-labels.js";
import { SIGNAL_NAMES } from "../src/load/lists.js";
import { allUnavailable, arbTrapRun, cheapPackage, cheapScan } from "./arbitraries.js";
import { drawerProps } from "./support/drawer-props.js";

afterEach(cleanup);

function withExtras(): { response: ScanResponse; pkg: PackageHealth } {
  const base = cheapScan(2);
  const pkg = base.report.packages[0] as PackageHealth;
  const response = {
    ...base,
    policy: {
      source: "file",
      pass: false,
      rules: [
        { index: 2, type: "forbid_state", name: "no-dead", pass: false, failures: [{ name: pkg.name, reason: "state is Possessed", source: null, fetchedAt: "2026-11-12T00:00:00.000Z" }], unevaluated: [], notFound: [] },
        { index: 5, type: "max_age_months", pass: true, failures: [], unevaluated: [], notFound: [] },
      ],
    },
    remediations: [{ packageName: pkg.name, kind: "bump", status: "proposed", title: "Bump <b>it</b>", summary: "Bump it", prBody: "<img src=x onerror=alert(1)>\n# not markdown" }],
  } as unknown as ScanResponse;
  return { response, pkg };
}

describe("focus trap", () => {
  // Feature: cemetery-ui, Property 21: The focus trap cycles over any number of key presses
  it("Feature: cemetery-ui, Property 21: The focus trap cycles over any number of key presses", () => {
    fc.assert(
      fc.property(arbTrapRun, ({ count, start, presses }) => {
        let pos = start;
        presses.forEach((shift, i) => {
          const next = trapStep(count, pos, shift);
          if (count === 0) {
            expect(next).toBe(-1);
            return;
          }
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThanOrEqual(count - 1);
          if (i > 0 || start >= 0) expect(next).toBe(shift ? (pos - 1 + count) % count : (pos + 1) % count);
          pos = next;
        });
        if (count > 0) {
          for (const shift of [false, true]) {
            let p = Math.max(start, 0);
            for (let k = 0; k < count; k += 1) p = trapStep(count, p, shift);
            expect(p).toBe(Math.max(start, 0));
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("cycles inside the real Drawer, from the close button through every stop and back", () => {
    const { response, pkg } = withExtras();
    render(<Drawer {...drawerProps(response, pkg)} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    const seen = new Set<Element>();
    for (let i = 0; i < 40 && !(i > 0 && document.activeElement === close); i += 1) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
      seen.add(document.activeElement as Element);
    }
    expect(document.activeElement).toBe(close);
    // The crumb, the close button, the selected tab only, the panel and its source links.
    expect(seen.has(within(dialog).getByRole("tab", { name: "Evidence" }))).toBe(true);
    expect(seen.has(within(dialog).getByRole("tab", { name: "History" }))).toBe(false);
    expect(seen.has(within(dialog).getByRole("tabpanel"))).toBe(true);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "← Cemetery" }));
  });
});

describe("Drawer component", () => {
  it("has dialog semantics and shows the twelve signals by label, the State, rules, and the plan as text (7.1, 7.2, 7.24)", () => {
    const { response, pkg } = withExtras();
    const { container } = render(<Drawer {...drawerProps(response, pkg)} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: `${pkg.name} ${pkg.installedVersion}` });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    const labels = [...dialog.querySelectorAll(".drawer-signals tbody tr td:first-child")].map((td) => td.textContent);
    expect(labels).toEqual(SIGNAL_NAMES.map((n) => SIGNAL_LABELS[n]));
    expect(dialog.querySelector(".verdict")?.textContent).toBe(`${pkg.state}. R`);
    expect(dialog.querySelector(".drawer-missing")?.textContent).toBe("none");
    // Property 15 render part: the rule is shown by index, and the empty text is absent.
    expect(dialog.querySelector('[data-rule-index="2"]')?.textContent).toContain("state is Possessed");
    expect(dialog.querySelector('[data-rule-index="5"]')).toBeNull();
    expect(dialog.textContent).toContain("not recorded");
    expect(dialog.textContent).not.toContain("no failing policy rules for this package");
    // Every source link is https, opens apart and sends no referrer.
    const links = [...container.querySelectorAll("a")];
    expect(links).toHaveLength(12);
    for (const a of links) {
      expect(a.getAttribute("href")).toBe("https://registry.example/x");
      expect(a.textContent).toBe("registry.example");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
    // The plan is text: its title, and its body in a closed disclosure with no injected elements.
    fireEvent.click(within(dialog).getByRole("tab", { name: "The fix" }));
    expect(dialog.querySelector(".fix-box b")?.textContent).toBe("Bump <b>it</b>");
    const disclosure = dialog.querySelector("details.pr-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("summary")?.textContent).toBe("Read the pull request text");
    const preview = disclosure.querySelector(".pr-preview");
    expect(preview?.querySelector("h4")?.textContent).toBe("not markdown");
    expect(preview?.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img, h1")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Open pull request" })).toBeNull();
    expect(within(dialog).getAllByRole("button", { name: /^Copy/ })).toHaveLength(1);
  });

  it("shows unavailable signals with the reason and no value, the empty texts, and an Alive fix tab", () => {
    const pkg = allUnavailable(cheapPackage("zed", "Alive"));
    render(<Drawer {...drawerProps(cheapScan(1), pkg)} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll("pre")).toHaveLength(0);
    for (const n of SIGNAL_NAMES) expect(dialog.textContent).toContain(`unavailable: why-${n}`);
    expect(dialog.querySelectorAll(".drawer-missing li")).toHaveLength(12);
    expect(dialog.textContent).toContain("no failing policy rules for this package");
    fireEvent.click(within(dialog).getByRole("tab", { name: "The fix" }));
    expect(dialog.querySelector(".fix-box")?.textContent).toBe("HealthyNothing to fix.");
    expect(dialog.querySelector(".drawer-note")?.textContent).toBe("No action needed.");
  });

  it("closes on Escape, the close button, the breadcrumb and the scrim, but not on a click inside, nor on Escape under a Pop-over", () => {
    const { response, pkg } = withExtras();
    let closed = 0;
    const onClose = (): void => {
      closed += 1;
    };
    const { container, rerender } = render(<Drawer {...drawerProps(response, pkg)} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(closed).toBe(0);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(closed).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(closed).toBe(2);
    fireEvent.click(container.querySelector(".backdrop") as HTMLElement);
    expect(closed).toBe(3);
    fireEvent.click(within(dialog).getByRole("button", { name: "← Cemetery" }));
    expect(closed).toBe(4);
    rerender(<Drawer {...drawerProps(response, pkg)} onClose={onClose} popoverOpen={true} />);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(closed).toBe(4);
  });
});

describe("Drawer in Cemetery", () => {
  function graveButtons(container: HTMLElement): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>("button[data-grave-index]")];
  }

  it("opens on click, makes the page inert, and returns focus to the same grave on each close path", () => {
    const { container } = render(<Cemetery response={cheapScan(3)} theme="light" reducedMotion={true} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    for (const close of ["escape", "button", "backdrop"] as const) {
      const target = graveButtons(container)[1] as HTMLButtonElement;
      target.focus();
      fireEvent.click(target);
      const dialog = screen.getByRole("dialog");
      // Spec clean-site, task 3: the page owns the one main; the Cemetery makes its scene inert.
      expect(container.querySelector("[inert]")?.querySelector(".scene-main")).not.toBeNull();
      expect(dialog.closest("[inert]")).toBeNull();
      if (close === "escape") fireEvent.keyDown(dialog, { key: "Escape" });
      else if (close === "button") fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      else fireEvent.click(container.querySelector(".backdrop") as HTMLElement);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(container.querySelector("[inert]")).toBeNull();
      const after = graveButtons(container);
      expect(document.activeElement).toBe(after[1]);
      expect(after.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    }
  });

  it("opens with Enter and Space as native button activation, here via click", () => {
    const { container } = render(<Cemetery response={cheapScan(2)} theme="dark" reducedMotion={true} />);
    const first = graveButtons(container)[0] as HTMLButtonElement;
    expect(first.tagName).toBe("BUTTON");
    expect(first.type).toBe("button");
    fireEvent.click(first);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("opens for a package with all twelve signals unavailable without throwing", () => {
    const response = cheapScan(1);
    (response.report.packages as unknown as PackageHealth[])[0] = allUnavailable(cheapPackage("pkg-0", "Alive"));
    const { container } = render(<Cemetery response={response} theme="light" reducedMotion={true} />);
    fireEvent.click(graveButtons(container)[0] as HTMLButtonElement);
    expect(screen.getByRole("dialog").textContent).toContain("unavailable");
  });
});
