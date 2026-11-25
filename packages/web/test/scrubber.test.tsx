import type { PackageTimeline, ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { setMedia } from "./setup.js";
import { PLAY_STEP_MS } from "../src/time/play.js";
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
    // Apiless mount: the evidence links, the Legend, the two Replay buttons, the Play control and then the slider (the field and Scan are disabled).
    for (let i = 0; i < 7; i += 1) await user.tab();
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
    // K2d fix 1, Deliberate test change 28: the version shows once, in the "Here lies" line.
    expect(tip.querySelector(".epitaph-line")?.textContent).toBe("Here lies pkg-0 9.9.9");
    expect(tip.querySelector(".tooltip-state")?.textContent).toBe("Possessed");
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

// Spec cemetery-time-fixes, task 3.5: the Play control (requirement 4).
describe("the Play control", () => {
  const play = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>("button.scrub-play") as HTMLButtonElement;
  const live = (): string => document.querySelector(".scrub-live")?.textContent ?? "";
  const step = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };
  afterEach(() => {
    vi.useRealTimers();
  });

  // Spec cemetery-undead, Deliberate test change 20: in the Footer bar, Play comes first, then the label, date and slider.
  it("is a native button named Play before the History date label and the slider, inside a polite live section", async () => {
    mount();
    await ready();
    const button = screen.getByRole("button", { name: "Play" });
    expect(button).toBe(play());
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("aria-pressed")).toBe(false);
    const date = document.querySelector(".scrub-date") as Element;
    const label = document.querySelector('label[for="history-date"]') as Element;
    expect(button.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(date.compareDocumentPosition(slider()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.closest("footer.night-footer")).not.toBeNull();
    const line = document.querySelector(".scrub-live") as HTMLElement;
    expect(line.tagName).toBe("P");
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(line.closest(".scrub")).not.toBeNull();
    expect(line.textContent).toBe("");
  });

  it("starts with Enter and with Space, and its name becomes Pause", async () => {
    const user = userEvent.setup();
    mount();
    await ready();
    play().focus();
    await user.keyboard("{Enter}");
    expect(play().textContent).toBe("Pause");
    expect(screen.getByRole("button", { name: "Pause" })).toBe(play());
    await user.keyboard("{Enter}");
    expect(play().textContent).toBe("Play");
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pause" })).toBe(play());
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Play" })).toBe(play());
  });

  it("at the last Stop moves to Stop 0, steps every 1,500 ms, announces each step and stops at the last", async () => {
    mount();
    await ready();
    const max = Number(slider().max);
    expect(slider().value).toBe(String(max));
    vi.useFakeTimers();
    fireEvent.click(play());
    expect(slider().value).toBe("0");
    expect(live()).toBe(`Playing from ${slider().getAttribute("aria-valuetext") ?? ""}`);
    expect(screen.queryByRole("status")).toBeNull();
    step(PLAY_STEP_MS - 1);
    expect(slider().value).toBe("0");
    step(1);
    expect(slider().value).toBe("1");
    expect(live()).toBe(slider().getAttribute("aria-valuetext"));
    expect(screen.queryByRole("status")).toBeNull();
    for (let i = 2; i <= max; i += 1) step(PLAY_STEP_MS);
    expect(slider().value).toBe(String(max));
    expect(play().textContent).toBe("Play");
    expect(live()).toBe(`End of history at ${slider().getAttribute("aria-valuetext") ?? ""}`);
    step(5 * PLAY_STEP_MS);
    expect(slider().value).toBe(String(max));
  });

  it("pauses on Pause and keeps the Stop", async () => {
    mount();
    await ready();
    vi.useFakeTimers();
    fireEvent.click(play());
    step(PLAY_STEP_MS);
    fireEvent.click(play());
    expect(slider().value).toBe("1");
    expect(play().textContent).toBe("Play");
    expect(live()).toBe(`Paused at ${slider().getAttribute("aria-valuetext") ?? ""}`);
    step(5 * PLAY_STEP_MS);
    expect(slider().value).toBe("1");
  });

  it("pauses on a slider move and on Back to now", async () => {
    mount();
    await ready();
    vi.useFakeTimers();
    fireEvent.click(play());
    move(3);
    expect(play().textContent).toBe("Play");
    step(5 * PLAY_STEP_MS);
    expect(slider().value).toBe("3");
    fireEvent.click(play());
    step(PLAY_STEP_MS);
    expect(slider().value).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Back to now" }));
    expect(slider().value).toBe(slider().max);
    expect(play().textContent).toBe("Play");
    step(5 * PLAY_STEP_MS);
    expect(slider().value).toBe(slider().max);
  });

  it("makes the same steps at the same times under Reduced motion", async () => {
    setMedia("(prefers-reduced-motion: reduce)", true);
    mount();
    await ready();
    vi.useFakeTimers();
    fireEvent.click(play());
    step(PLAY_STEP_MS - 1);
    expect(slider().value).toBe("0");
    step(1);
    expect(slider().value).toBe("1");
    step(PLAY_STEP_MS);
    expect(slider().value).toBe("2");
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

  it("has no axe violations while playing", async () => {
    mount();
    await ready();
    vi.useFakeTimers();
    fireEvent.click(play());
    expect(play().textContent).toBe("Pause");
    // Fake timers hold the next step, so no tick lands while axe runs.
    vi.useRealTimers();
    const result = await axe.run(document, AXE_OPTIONS);
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    expect(play().textContent).toBe("Pause");
    fireEvent.click(play());
  });
});
