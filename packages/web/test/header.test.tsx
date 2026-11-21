import type { ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { Header } from "../src/header/Header.js";
import { headerModel } from "../src/header/header-model.js";
import { arbHeaderResponse, arbHostilePair, cheapScan, mapFreeText } from "./arbitraries.js";

afterEach(cleanup);

const noSubmit = (): string | null => null;

function renderHeader(response: ScanResponse, isDemo: boolean, apiConfigured = true) {
  return render(
    <Header model={headerModel(response, isDemo)} theme="light" apiConfigured={apiConfigured} onSubmit={noSubmit} />,
  );
}

describe("Property 14: Header values follow the response exactly", () => {
  it("Feature: cemetery-ui, Property 14: Header values follow the response exactly", () => {
    fc.assert(
      fc.property(arbHeaderResponse, ({ response, isDemo }) => {
        const model = headerModel(response, isDemo);
        const scan = response.report.scan;
        const unlocked = scan !== undefined && (scan.unlocked || scan.unlockedPackages.length > 0);
        expect(model.unlockedNotice !== null).toBe(unlocked);
        if (model.unlockedNotice !== null && scan !== undefined) {
          expect(model.unlockedNotice).toContain("unlocked");
          if (!scan.unlocked) {
            const n = scan.unlockedPackages.length;
            for (const name of scan.unlockedPackages.slice(0, 20)) expect(model.unlockedNotice).toContain(name);
            if (n > 20) expect(model.unlockedNotice.endsWith(`and ${String(n - 20)} more`)).toBe(true);
            else expect(model.unlockedNotice).not.toContain(" more");
          }
        }
        expect(model.cappedNotice !== null).toBe(scan?.capped === true);
        if (model.cappedNotice !== null && scan !== undefined) {
          expect(model.cappedNotice).toContain(String(response.report.packages.length));
          expect(model.cappedNotice).toContain(String(scan.totalDirect));
        }
        expect(model.policyStatus).toBe(response.policy.pass ? "pass" : "fail");
        expect(model.policyLabel).toBe(response.policy.source === "default" ? "default policy" : "policy file");
        expect(model.failingRules).toBe(response.policy.rules.filter((r) => !r.pass).length);
        expect(model.scanTime).toBe(response.report.generatedAt);
        expect(model.repoText).toBe(scan === undefined ? "no scan metadata in this response" : scan.repo.url);
        expect(model.demoLabel).toBe(isDemo ? "demo fixture, recorded data" : null);

        const { container, unmount } = renderHeader(response, isDemo);
        const text = container.textContent ?? "";
        expect(text).toContain(model.repoText);
        expect(text).toContain(model.scanTime);
        expect(text).toContain(model.policyStatus);
        expect(text).toContain(model.policyLabel);
        if (model.unlockedNotice !== null) expect(text).toContain(model.unlockedNotice);
        expect(text.includes("demo fixture, recorded data")).toBe(isDemo);
        expect(container.querySelector("a")).toBeNull();
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

function tags(root: Element): string[] {
  return [...root.querySelectorAll("*")].map((el) => el.tagName);
}

function view(response: ScanResponse): { header: string[]; overlay: string[]; drawer: string[]; text: string } {
  const h = renderHeader(response, false);
  const header = tags(h.container);
  const headerText = h.container.textContent ?? "";
  h.unmount();
  const c = render(<Cemetery response={response} theme="light" reducedMotion={true} />);
  const overlay = tags(c.container);
  const first = c.container.querySelector<HTMLButtonElement>("button[data-grave-index]");
  let drawer: string[] = [];
  let drawerText = "";
  if (first !== null) {
    fireEvent.click(first);
    const dialog = screen.getByRole("dialog");
    drawer = tags(dialog);
    drawerText = dialog.textContent ?? "";
  }
  c.unmount();
  return { header, overlay, drawer, text: headerText + drawerText };
}

describe("Property 22: Untrusted strings are rendered only as text", () => {
  it("Feature: cemetery-ui, Property 22: Untrusted strings are rendered only as text", () => {
    fc.assert(
      fc.property(arbHostilePair, ({ response, prefix }) => {
        const plain = view(response);
        const hostile = view(mapFreeText(response, (s) => `${prefix}${s}`));
        expect(hostile.header).toEqual(plain.header);
        expect(hostile.overlay).toEqual(plain.overlay);
        expect(hostile.drawer).toEqual(plain.drawer);
        for (const bad of ["SCRIPT", "IMG", "A", "IFRAME", "SVG"]) {
          expect(hostile.header.includes(bad) && !plain.header.includes(bad)).toBe(false);
          expect(hostile.drawer.includes(bad)).toBe(false);
        }
        const repo = response.report.scan?.repo.url;
        if (repo !== undefined) expect(hostile.text).toContain(`${prefix}${repo}`);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Header examples", () => {
  it("says so when scan metadata is absent and still shows the time", () => {
    const response = cheapScan(1);
    const { container } = renderHeader(response, false);
    expect(container.textContent).toContain("no scan metadata in this response");
    expect(container.textContent).toContain("2026-11-12T00:00:00.000Z");
  });

  it("disables the field and the submit control with the exact text when no API is configured", () => {
    const { container } = renderHeader(cheapScan(1), false, false);
    expect((screen.getByLabelText("Repository URL") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Scan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain("hosted scan arrives with release 0.1 infra");
  });

  it("enables the field when an API is configured and hides the disabled text", () => {
    const { container } = renderHeader(cheapScan(1), false, true);
    expect((screen.getByLabelText("Repository URL") as HTMLInputElement).disabled).toBe(false);
    expect(container.textContent).not.toContain("hosted scan arrives");
  });

  it("shows a returned validation message in an alert", () => {
    render(<Header model={null} theme="light" apiConfigured={true} onSubmit={() => "fixed message"} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(screen.getByRole("alert").textContent).toBe("fixed message");
  });

  it("keeps the legend closed at load and lists the contents when opened", () => {
    const { container } = renderHeader(cheapScan(1), false);
    const toggle = screen.getByRole("button", { name: "Legend" });
    const panel = container.querySelector("#legend-panel") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    for (const state of ["Possessed", "Dead", "Haunted", "Restless", "Alive"]) expect(panel.textContent).toContain(state);
    expect(panel.textContent).toContain("one or more advisories");
    expect(panel.textContent).toContain(
      "Triage order: Possessed first, then state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then highest advisory severity, then transitive reach, then name.",
    );
    expect(panel.querySelectorAll("svg").length).toBe(6);
  });

  it("omits the demo label for a non-demo load of a response naming sexton-demo/fixture", () => {
    const response = cheapScan(1);
    (response.report as unknown as Record<string, unknown>)["scan"] = {
      repo: { owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" },
      unlocked: false,
      unlockedPackages: [],
      lockfileVersion: 3,
      capped: false,
      totalDirect: 1,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    };
    const { container } = renderHeader(response, false);
    expect(container.textContent).toContain("https://github.com/sexton-demo/fixture");
    expect(container.textContent).not.toContain("demo fixture, recorded data");
  });

  it("states that no lockfile exists for an unlocked scan", () => {
    const response = cheapScan(1);
    (response.report as unknown as Record<string, unknown>)["scan"] = {
      repo: { owner: "o", repo: "r", url: "https://github.com/o/r" },
      unlocked: true,
      unlockedPackages: [],
      lockfileVersion: null,
      capped: true,
      totalDirect: 400,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    };
    const model = headerModel(response, false);
    expect(model.unlockedNotice).toBe("unlocked scan: no lockfile exists, so versions were resolved from declared ranges");
    expect(model.cappedNotice).toBe("capped: showing 1 of 400 direct dependencies");
  });
});
