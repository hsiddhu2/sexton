import type { PackageTimeline, ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";
afterEach(cleanup);
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});
const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: { "color-contrast": { enabled: false } },
};
function fetchOf(text: string, calls: string[] = []): typeof fetch {
  return ((input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input));
    return Promise.resolve(new Response(text, { status: 200 }));
  }) as typeof fetch;
}
function mount(text: string = readDemoScanText(), options: { apiBase?: string | null; calls?: string[] } = {}) {
  return render(
    <App fetchFn={fetchOf(text, options.calls)} apiBase={options.apiBase ?? null} initialSearch="" pageOrigin="http://localhost" />,
  );
}
async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}
const slider = (): HTMLInputElement => screen.getByRole("slider", { name: "History date" }) as HTMLInputElement;
const move = (value: number): void => {
  fireEvent.change(slider(), { target: { value: String(value) } });
};
const NOTE = "Before the scan date Sexton uses only dated facts. Deprecation, undated advisories and snapshot history are unknown.";
describe("scrubber on the demo scan (requirements 11, 12)", () => {
  it("is a native range with min 0, step 1, max one less than the Stops and the scan date at the end", async () => {
    mount();
    await ready();
    const input = slider();
    expect(input.type).toBe("range");
    expect([input.min, input.step]).toEqual(["0", "1"]);
    const max = Number(input.max);
    expect(max).toBeGreaterThan(1);
    expect(input.value).toBe(String(max));
    expect(input.getAttribute("aria-valuetext")).toBe("12 Nov 2026, 00:00 UTC");
    move(0);
    expect(slider().getAttribute("aria-valuetext")).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC$/);
    expect(slider().getAttribute("aria-valuetext")).not.toBe("12 Nov 2026, 00:00 UTC");
    const ticks = document.querySelector(".scrub-ticks");
    expect(ticks?.getAttribute("aria-hidden")).toBe("true");
    expect(ticks?.querySelectorAll("path")).toHaveLength(1);
  });
  it("is reachable by Tab", async () => {
    const user = userEvent.setup();
    mount();
    await ready();
    // Spec clean-site, task 3: the slider is the Footer bar's first stop, after the header, the Welcome bar, the chips,
    // the view switch and the one roving grave.
    let presses = 0;
    while (document.activeElement !== slider() && presses < 40) {
      await user.tab();
      presses += 1;
    }
    expect(document.activeElement).toBe(slider());
    expect(document.querySelectorAll("button[data-grave-index]")[0]?.compareDocumentPosition(slider()) ?? 0).toBeTruthy();
  });
  it("shows as of, the two caption lines and Back to now only before the scan date, and Back to now returns focus to the slider", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await ready();
    // Spec clean-site, 2.3, 2.11 and 16.4: the date badge, the past-tense headline and Back to now replace "as of".
    expect(container.querySelector(".date-badge")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back to now" })).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText("The drawer shows the scan date.")).toBeNull();
    expect(container.querySelector(".scrub-ends")?.textContent).toMatch(/Today, 12 Nov 2026$/);
    move(0);
    expect(container.querySelector(".date-badge")?.textContent).toMatch(/^Viewing \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    expect(container.querySelector(".headline")?.textContent).toMatch(/needed you on \d{1,2} [A-Z][a-z]{2} \d{4}\.$/);
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByText("The drawer shows the scan date.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back to now" }));
    expect(slider().value).toBe(slider().max);
    expect(document.activeElement).toBe(slider());
    expect(container.querySelector(".date-badge")).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
  });
  it("shows the Not-published form in the grave names at the first Stop and the scan states at the last", async () => {
    const { container } = mount();
    await ready();
    const names = (): string[] => [...container.querySelectorAll("button[data-grave-index]")].map((b) => b.getAttribute("aria-label") ?? "");
    const now = names();
    move(0);
    const then = names();
    // A package whose Timeline starts at coveredFrom (old versions dropped) shows its first Form instead.
    expect(then.some((n) => n.endsWith("not yet published on this date"))).toBe(true);
    expect(then).not.toEqual(now);
    move(Number(slider().max));
    expect(names()).toEqual(now);
  });
  it("keeps the policy line and the evidence links, and sends no request, when the slider moves", async () => {
    const calls: string[] = [];
    const { container } = mount(readDemoScanText(), { calls });
    await ready();
    const policy = container.querySelector(".footer-policy")?.textContent;
    const links = [...container.querySelectorAll("a.evidence-link")].map((a) => a.getAttribute("href"));
    const before = calls.length;
    move(0);
    move(2);
    expect(container.querySelector(".footer-policy")?.textContent).toBe(policy);
    expect([...container.querySelectorAll("a.evidence-link")].map((a) => a.getAttribute("href"))).toEqual(links);
    expect(calls).toHaveLength(before);
  });
  it("resets to the scan date when a new response loads", async () => {
    const user = userEvent.setup();
    mount(readDemoScanText(), { apiBase: "https://api.example" });
    await ready();
    move(1);
    expect(slider().value).toBe("1");
    await user.type(screen.getByLabelText("GitHub repository to scan"), "https://github.com/a/b");
    await user.click(screen.getByRole("button", { name: "Scan" }));
    await waitFor(() => {
      expect(slider().value).toBe(slider().max);
    });
  });
  it("has no violations with the slider at a middle Stop", async () => {
    mount();
    await ready();
    move(Math.floor(Number(slider().max) / 2));
    const result = await axe.run(document, AXE_OPTIONS);
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});
describe("no timelines", () => {
  it("renders no scrubber", async () => {
    mount(JSON.stringify(cheapScan(3)));
    await ready();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(document.querySelector(".scrub")).toBeNull();
  });
});
describe("versioned Segments (requirement 12.9)", () => {
  const versioned: PackageTimeline = {
    installed: "1.0.0",
    coveredFrom: null,
    segments: [
      { from: "2026-03-30T23:21:00.000Z", state: "Restless", reason: "all state signals unavailable", ghost: false, version: "8.8.8" },
      { from: "2026-03-31T00:21:00.000Z", state: "Possessed", reason: "provenance regression", ghost: false, version: "9.9.9" },
      { from: "2026-03-31T03:29:00.000Z", state: "Restless", reason: "all state signals unavailable", ghost: false, version: "8.8.8" },
    ],
  };
  const plain: PackageTimeline = {
    installed: "1.0.0",
    coveredFrom: null,
    segments: [
      { from: "2026-03-30T23:21:00.000Z", state: "Restless", reason: "old reason", ghost: false },
      { from: "2026-11-12T00:00:00.000Z", state: "Alive", reason: "r", ghost: false },
    ],
  };
  const scan = (): ScanResponse => ({ ...cheapScan(2), timelines: { "pkg-0": versioned, "pkg-1": plain } });
  const button = (container: HTMLElement, name: string): HTMLElement =>
    [...container.querySelectorAll<HTMLElement>("button[data-grave-index]")].find((b) => (b.getAttribute("aria-label") ?? "").startsWith(`${name} `)) as HTMLElement;
  it("starts at the first versioned Segment, with no extra hour", async () => {
    mount(JSON.stringify(scan()));
    await ready();
    move(0);
    expect(slider().getAttribute("aria-valuetext")).toBe("30 Mar 2026, 23:21 UTC");
  });
  // Spec clean-site, task 2.1: the tooltip half went with the tooltip (4.1).
  it("shows the Segment version in the button name and drawer title, and the report version for an unversioned Segment", async () => {
    const { container } = mount(JSON.stringify(scan()));
    await ready();
    move(1); // 2026-03-31T00:21 UTC
    expect(button(container, "pkg-0").getAttribute("aria-label")).toBe("pkg-0 9.9.9, Possessed");
    expect(button(container, "pkg-1").getAttribute("aria-label")).toBe("pkg-1 1.0.0, Restless");
    fireEvent.pointerEnter(button(container, "pkg-0"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(button(container, "pkg-0"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("pkg-0 9.9.9");
    expect(dialog.querySelector(".drawer-asof")?.textContent).toBe("State on 31 Mar 2026, 00:21 UTC: Possessed. provenance regression");
  });
  it("shows no State line in the drawer for an unversioned Segment", async () => {
    const { container } = mount(JSON.stringify(scan()));
    await ready();
    move(1);
    fireEvent.click(button(container, "pkg-1"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("pkg-1 1.0.0");
    expect(dialog.querySelector(".drawer-asof")).toBeNull();
  });
});

// Spec cemetery-time-fixes, task 3.5: the Play control (requirement 4). Spec clean-site, 4.1: Home has no Play
// control; the Replay's "Play all" and its cases are in replay-view.test.tsx (task 6.3).
describe("the Play control", () => {
  it("is not on Home", async () => {
    mount();
    await ready();
    expect(slider()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(document.querySelector("button.scrub-play")).toBeNull();
  });

  it("is not rendered with one Stop", async () => {
    const one: PackageTimeline = { installed: "1.0.0", coveredFrom: null, segments: [{ from: "2026-11-12T00:00:00.000Z", state: "Alive", reason: "r", ghost: false, version: "1.0.0" }] };
    const base = cheapScan(1);
    const name = base.report.packages[0]?.name as string;
    mount(JSON.stringify({ ...base, report: { ...base.report, generatedAt: "2026-11-12T00:00:00.000Z" }, timelines: { [name]: one } }));
    await ready();
    // A versioned Segment at the Scan date: the start and the Scan date are one Stop.
    expect(Number(slider().max)).toBe(0);
    expect(document.querySelector("button.scrub-play")).toBeNull();
  });
});
