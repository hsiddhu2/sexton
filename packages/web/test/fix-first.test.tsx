// Spec judge-path, requirement 2: the Fix-first line names the first grave in triage order, its State and its reason.
import type { ScanResponse } from "@sexton/api";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { ALL_ALIVE_TEXT, fixFirst, fixFirstText } from "../src/header/fix-first.js";
import { triageOrder } from "../src/triage/triage.js";
import { arbScanResponse, cheapPackage } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { readReplay, readReplayText } from "./support/replay-fixture.js";

afterEach(cleanup);

const ORIGIN = "http://localhost";
const LEFT_PADDER = "Fix first: left-padder 1.2.1, Possessed, maintainer change in the last 90 days";

function fetchOf(body: (url: string) => string): typeof fetch {
  return ((input: RequestInfo | URL): Promise<Response> => Promise.resolve(new Response(body(String(input)), { status: 200 }))) as typeof fetch;
}

function mount(options: { search?: string; fetchFn?: typeof fetch } = {}) {
  return render(<App fetchFn={options.fetchFn ?? fetchOf(() => readDemoScanText())} apiBase={null} initialSearch={options.search ?? ""} pageOrigin={ORIGIN} />);
}

async function ready(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector("button[data-grave-index]")).not.toBeNull();
  });
}

describe("Feature: judge-path, Property 3: Fix first is the first grave in triage order", () => {
  it("is null for a replay or no packages, all-alive exactly when every package is Alive, else triage index 0", () => {
    const replay = (readReplay("axios") as ScanResponse).replay;
    fc.assert(
      fc.property(arbScanResponse, fc.boolean(), (response, asReplay) => {
        const r = asReplay ? ({ ...response, replay } as ScanResponse) : response;
        const f = fixFirst(r);
        const packages = r.report.packages;
        if (asReplay || packages.length === 0) {
          expect(f).toBeNull();
          return;
        }
        if (packages.every((p) => p.state === "Alive")) {
          expect(f).toEqual({ kind: "all-alive" });
          expect(fixFirstText({ kind: "all-alive" })).toBe(ALL_ALIVE_TEXT);
          return;
        }
        const top = triageOrder(packages)[0];
        expect(f).toEqual({ kind: "grave", index: 0, name: top?.name, version: top?.installedVersion, state: top?.state, reason: top?.stateReason });
        if (f === null || f.kind !== "grave") throw new Error("expected a grave");
        const text = fixFirstText(f);
        for (const part of [f.name, f.version, f.state, f.reason]) expect(text).toContain(part);
        expect(text.startsWith("Fix first: ")).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("the Fix-first line on the page", () => {
  it("names left-padder on the Demo as a native button in the header", async () => {
    mount();
    await ready();
    const button = screen.getByRole("button", { name: LEFT_PADDER });
    expect(button.tagName).toBe("BUTTON");
    expect(button.closest("header")).not.toBeNull();
  });

  it("selects the Fix-first grave and focuses its button, so its tooltip shows", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await ready();
    const grave = container.querySelector<HTMLElement>('button[data-grave-index="0"]');
    // Move the selection away first, so the press has something to do.
    act(() => {
      container.querySelector<HTMLElement>('button[data-grave-index="3"]')?.focus();
    });
    expect(grave?.getAttribute("tabindex")).toBe("-1");
    await user.click(screen.getByRole("button", { name: LEFT_PADDER }));
    await waitFor(() => {
      expect(document.activeElement).toBe(grave);
    });
    expect(grave?.getAttribute("tabindex")).toBe("0");
    expect(grave?.getAttribute("aria-label")).toMatch(/^left-padder/);
    expect(grave?.getAttribute("aria-describedby")).not.toBeNull();
  });

  it("stays in Serious mode", async () => {
    const user = userEvent.setup();
    mount();
    await ready();
    await user.click(screen.getByRole("button", { name: "Serious mode" }));
    expect(screen.getByRole("button", { name: LEFT_PADDER })).toBeTruthy();
  });

  it("is hidden on a replay", async () => {
    mount({ search: "?replay=axios", fetchFn: fetchOf((url) => (url.includes("/replay/axios.json") ? readReplayText("axios") : readDemoScanText())) });
    await ready();
    expect(document.querySelector(".fix-first-line")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Fix first:/ })).toBeNull();
  });

  it("says nothing to fix first when every dependency is Alive, with no button", async () => {
    const scan = { report: { generatedAt: "2026-11-12T00:00:00.000Z", packages: [cheapPackage("a", "Alive"), cheapPackage("b", "Alive")] }, policy: { source: "default", pass: true, rules: [] } };
    mount({ fetchFn: fetchOf(() => JSON.stringify(scan)) });
    await ready();
    expect(screen.getByText(ALL_ALIVE_TEXT).tagName).toBe("P");
    expect(screen.queryByRole("button", { name: /Fix first/ })).toBeNull();
  });
});
