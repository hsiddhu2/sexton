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
    // Apiless mount: the evidence links, the Legend, the two Replay buttons and then the slider (the field and Scan are disabled).
    for (let i = 0; i < 6; i += 1) await user.tab();
    expect(document.activeElement).toBe(slider());
  });
  it("shows as of, the two caption lines and Back to now only before the scan date, and Back to now returns focus to the slider", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await ready();
    expect(container.querySelector(".as-of")).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText("The drawer shows the scan date.")).toBeNull();
    move(0);
    const asOf = container.querySelector(".as-of");
    expect(asOf?.textContent).toMatch(/^as of /);
    expect(asOf?.querySelector("time")?.getAttribute("datetime")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByText("The drawer shows the scan date.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back to now" }));
    expect(slider().value).toBe(slider().max);
    expect(document.activeElement).toBe(slider());
    expect(container.querySelector(".as-of")).toBeNull();
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
    const policy = container.querySelector(".header-policy")?.textContent;
    const links = [...container.querySelectorAll("a.evidence-link")].map((a) => a.getAttribute("href"));
    const before = calls.length;
    move(0);
    move(2);
    expect(container.querySelector(".header-policy")?.textContent).toBe(policy);
    expect([...container.querySelectorAll("a.evidence-link")].map((a) => a.getAttribute("href"))).toEqual(links);
    expect(calls).toHaveLength(before);
  });
  it("resets to the scan date when a new response loads", async () => {
    const user = userEvent.setup();
    mount(readDemoScanText(), { apiBase: "https://api.example" });
    await ready();
    move(1);
    expect(slider().value).toBe("1");
    await user.type(screen.getByLabelText("Repository URL"), "https://github.com/a/b");
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
  it("shows the Segment version in the button name, tooltip and drawer title, and the report version for an unversioned Segment", async () => {
    const { container } = mount(JSON.stringify(scan()));
    await ready();
    move(1); // 2026-03-31T00:21 UTC
    expect(button(container, "pkg-0").getAttribute("aria-label")).toBe("pkg-0 9.9.9, Possessed");
    expect(button(container, "pkg-1").getAttribute("aria-label")).toBe("pkg-1 1.0.0, Restless");
    fireEvent.pointerEnter(button(container, "pkg-0"));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("9.9.9, Possessed");
    expect(tip.textContent).toContain("as of 31 Mar 2026, 00:21 UTC");
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
