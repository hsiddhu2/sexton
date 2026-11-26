// Spec clean-site, task 3: the shell on the demo scan. Home (2.4 to 2.15), the Panel (3.1 to 3.25), the Footer bar and
// the site footer (16.3 to 16.16), the Welcome bar (9.5 to 9.11), and the screen state as the one owner of what is open.
import type { ScanResponse } from "@sexton/api";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { resetWelcomeForTests, WELCOME_KEY } from "../src/guide/welcome-pref.js";
import { HELP_LINE } from "../src/home/HomeView.js";
import { reserveFor, RESERVE_GAPS } from "../src/home/use-reserve.js";
import { REPLAY_CARD, REPLAY_IDS } from "../src/replay/replay-ids.js";
import { stopsFor } from "../src/time/stops.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { readReplay, readReplayText } from "./support/replay-fixture.js";

afterEach(cleanup);
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
  window.localStorage.clear();
  resetWelcomeForTests();
});

const ORIGIN = "http://localhost";
const API = "https://api.example";

function mount(options: { apiBase?: string | null; body?: string; search?: string; pending?: boolean } = {}) {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    if (options.pending === true && url.includes("/scan?")) return new Promise<Response>(() => undefined);
    return Promise.resolve(new Response(options.body ?? readDemoScanText(), { status: 200 }));
  }) as typeof fetch;
  const view = render(<App fetchFn={fetchFn} apiBase={options.apiBase ?? null} initialSearch={options.search ?? ""} pageOrigin={ORIGIN} />);
  return { ...view, urls };
}
async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}
const graves = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>("button.grave-button")];
const grave = (name: string): HTMLButtonElement =>
  graves().find((b) => (b.getAttribute("aria-label") ?? "").startsWith(`${name} `)) as HTMLButtonElement;
const inspector = (): HTMLElement => document.querySelector(".inspector") as HTMLElement;
const looked = (): string => inspector().querySelector(".inspector-name")?.textContent ?? "";

describe("Home: headline, notices, chips and the view switch (2.1 to 2.15)", () => {
  it("reads the headline with the Possessed count, and one chip per State in order with its count", async () => {
    const { container } = mount();
    await ready();
    const h1 = container.querySelector("h1.headline") as HTMLElement;
    expect(h1.textContent).toBe("1 of 12 dependencies needs you now.");
    expect(h1.querySelector(".headline-count")?.textContent).toBe("1");
    const chips = [...container.querySelectorAll<HTMLButtonElement>(".chip")];
    expect(chips.map((c) => c.textContent)).toEqual(["Possessed 1", "Dead 5", "Haunted 1", "Restless 3", "Alive 2"]);
    for (const chip of chips) expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll(".notice")).toHaveLength(0);
  });

  it("reads Nothing needs you now. with no Possessed package, and shows the notices under the headline", async () => {
    const scan = cheapScan(3);
    const meta = {
      repo: { owner: "o", repo: "r", url: "https://github.com/o/r" },
      unlocked: true,
      unlockedPackages: [],
      lockfileVersion: null,
      capped: true,
      totalDirect: 9,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    };
    const packages = scan.report.packages.map((p) => ({ ...p, state: "Alive" as const }));
    const body: ScanResponse = { ...scan, report: { ...scan.report, packages, scan: meta } as ScanResponse["report"] };
    const { container } = mount({ body: JSON.stringify(body), search: "?scan=%2Fx.json" });
    await ready();
    expect(container.querySelector("h1")?.textContent).toBe("Nothing needs you now.");
    expect([...container.querySelectorAll(".notice")].map((n) => n.textContent)).toEqual([
      "No lockfile: versions were resolved from package.json ranges.",
      "Showing 3 of 9 direct dependencies.",
    ]);
  });

  it("filters by a chip: only it is pressed, other graves leave the tab order, and a second press clears it (2.5 to 2.8)", async () => {
    const { container } = mount();
    await ready();
    const dead = screen.getByRole("button", { name: "Dead 5" });
    fireEvent.click(dead);
    expect([...container.querySelectorAll(".chip")].map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false", "false"]);
    // The Selected grave is Possessed and dimmed, so the first Dead grave holds the one tab stop.
    const stops = graves().filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.getAttribute("aria-label")).toMatch(/, Dead/);
    expect(grave("left-padder").tabIndex).toBe(-1);
    fireEvent.click(dead);
    expect(dead.getAttribute("aria-pressed")).toBe("false");
    expect(grave("left-padder").tabIndex).toBe(0);
  });

  it("switches to the List and back with aria-pressed, the List opening a Drawer from a row (2.9, 6.1, 6.9, 6.15)", async () => {
    const { container } = mount();
    await ready();
    const yard = screen.getByRole("button", { name: "Graveyard" });
    const list = screen.getByRole("button", { name: "List" });
    expect([yard.getAttribute("aria-pressed"), list.getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    expect(yard.closest(".scene-card")).toBeNull();
    fireEvent.click(list);
    expect([yard.getAttribute("aria-pressed"), list.getAttribute("aria-pressed")]).toEqual(["false", "true"]);
    expect(container.querySelector("canvas:not(.ghost-picture)")).toBeNull();
    expect(container.querySelector(".scene-help")).toBeNull();
    const table = container.querySelector("table.list-table") as HTMLElement;
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Package", "Version", "State ↑ worst first", "Why", "Fix"]);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(12);
    expect(table.querySelector("tbody tr td")?.textContent).toBe("left-padder");
    const row = within(table).getByRole("button", { name: "event-stream" });
    fireEvent.click(row);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(within(table).getByRole("button", { name: "event-stream" }));
    fireEvent.click(yard);
    expect(container.querySelector("canvas:not(.ghost-picture)")).not.toBeNull();
  });

  it("shows the help line in the Graveyard view, and the date badge and past headline at an earlier date (2.3, 2.10, 2.11)", async () => {
    const { container } = mount();
    await ready();
    expect(container.querySelector(".scene-help")?.textContent).toBe(HELP_LINE);
    expect(HELP_LINE).toBe("Point at a grave to see its details on the right. Click it to open.");
    expect(container.querySelector(".date-badge")).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "History date" }), { target: { value: "0" } });
    expect(container.querySelector(".scene-help")).toBeNull();
    const badge = container.querySelector(".date-badge")?.textContent ?? "";
    expect(badge).toMatch(/^Viewing \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    const date = badge.replace("Viewing ", "");
    expect(container.querySelector("h1")?.textContent).toMatch(new RegExp(`^(Nothing needed you on ${date}\\.|\\d+ of \\d+ dependencies needed you on ${date}\\.)$`));
    // The chips count the States at the shown date.
    const total = [...container.querySelectorAll(".chip b")].reduce((a, b) => a + Number(b.textContent), 0);
    expect(total).toBeLessThanOrEqual(12);
  });
});

describe("the Panel (3.1 to 3.25)", () => {
  it("shows the Selected grave at load, with its sentence, three signals and the gold button", async () => {
    mount();
    await ready();
    expect(inspector().querySelector(".eyebrow")?.textContent).toBe("You are looking atSelected");
    expect(looked()).toBe("left-padder");
    expect(inspector().querySelector(".inspector-version")?.textContent).toBe("1.2.1");
    expect(inspector().querySelector(".badge")?.textContent).toBe("Possessed");
    expect(inspector().querySelector(".inspector-why")?.textContent).toBe("A maintainer of this package changed in the last 90 days.");
    expect([...inspector().querySelectorAll(".signal-label")].map((l) => l.textContent)).toEqual(["Maintainer change", "Maintainers", "Provenance"]);
    // Terms in the labels and the sentence are buttons with a dotted underline (11.2).
    expect(inspector().querySelectorAll(".signal-label button.term").length).toBe(3);
    expect(within(inspector()).getByRole("button", { name: "See the evidence" })).toBeTruthy();
  });

  it("follows the pointer and focus without the Selected mark, and returns to the Selected grave (3.3 to 3.5)", async () => {
    mount();
    await ready();
    fireEvent.pointerEnter(grave("event-stream"));
    expect(looked()).toBe("event-stream");
    expect(inspector().querySelector(".eyebrow-mark")).toBeNull();
    expect(within(inspector()).getByRole("button", { name: "See the evidence and the fix" })).toBeTruthy();
    fireEvent.pointerLeave(grave("event-stream"));
    expect(looked()).toBe("left-padder");
    expect(inspector().querySelector(".eyebrow-mark")?.textContent).toBe("Selected");
    act(() => {
      grave("left-padder").focus();
    });
    expect(inspector().querySelector(".eyebrow-mark")).toBeNull();
  });

  it("opens the Drawer for the package the Inspector shows (3.8)", async () => {
    mount();
    await ready();
    fireEvent.pointerEnter(grave("lodash"));
    fireEvent.click(within(inspector()).getByRole("button", { name: "See the evidence and the fix" }));
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 2 }).textContent).toContain("lodash");
  });

  it("lists the Fix order in triage order with the current-row mark; a row selects and opens nothing (3.18 to 3.21)", async () => {
    const { container } = mount();
    await ready();
    const card = container.querySelector(".fix-order") as HTMLElement;
    expect(card.querySelector(".eyebrow")?.textContent).toBe("Fix in this order");
    const rows = [...card.querySelectorAll<HTMLButtonElement>(".fix-row")];
    expect(rows.map((r) => [r.querySelector(".fix-name")?.textContent, r.querySelector(".fix-line")?.textContent])).toEqual([
      ["1left-padder", "review the maintainer change"],
      ["2event-stream", "bump to 4.0.0"],
      ["3uuid", expect.stringMatching(/^bump to /)],
      ["4request", "no safe version"],
      ["5left-pad", "no safe version"],
    ]);
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual(["true", null, null, null, null]);
    fireEvent.click(rows[1] as HTMLButtonElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(looked()).toBe("event-stream");
    expect(inspector().querySelector(".eyebrow-mark")?.textContent).toBe("Selected");
    expect([...card.querySelectorAll(".fix-row")].map((r) => r.getAttribute("aria-current"))).toEqual([null, "true", null, null, null]);
    expect(grave("event-stream").tabIndex).toBe(0);
  });

  it("reads Nothing to fix. when no package is Possessed, Dead or Haunted (3.22)", async () => {
    const scan = cheapScan(2);
    const calm: ScanResponse = { ...scan, report: { ...scan.report, packages: scan.report.packages.map((p) => ({ ...p, state: "Alive" as const })) } };
    const { container } = mount({ body: JSON.stringify(calm) });
    await ready();
    expect(container.querySelector(".fix-none")?.textContent).toBe("Nothing to fix. Every dependency is Restless or Alive.");
  });

  it("moves the Selected grave with Left and Right in triage order, wrapping, with focus on a grave or the body (3.23)", async () => {
    const user = userEvent.setup();
    mount();
    await ready();
    act(() => {
      grave("left-padder").focus();
    });
    await user.keyboard("{ArrowLeft}");
    // Wraps from the first grave to the last in triage order.
    expect(document.activeElement).toBe(graves().find((b) => b.dataset["graveIndex"] === "11"));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(grave("left-padder"));
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(document.body);
    expect(looked()).toBe("event-stream");
    // Enter on the body opens the Selected grave's Drawer (3.24).
    await user.keyboard("{Enter}");
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 2 }).textContent).toContain("event-stream");
  });

  it("leaves the keys alone with a Pop-over open or focus in the scrubber", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(looked()).toBe("left-padder");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Legend" }).getAttribute("aria-expanded")).toBe("false");
    const slider = screen.getByRole("slider", { name: "History date" });
    act(() => {
      slider.focus();
    });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(looked()).toBe("left-padder");
  });

  it("states the State on an earlier date, or that the version did not exist yet (3.12)", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByRole("slider", { name: "History date" }), { target: { value: "0" } });
    expect(inspector().querySelector(".inspector-why")?.textContent).toMatch(/^(On \d{1,2} [A-Z][a-z]{2} \d{4} this package was (Possessed|Dead|Haunted|Restless|Alive)\.|The installed version did not exist yet\.)$/);
  });

  it("opens a Term's meaning beside it and closes it on a press outside (11.2, 11.4, 11.5)", async () => {
    mount();
    await ready();
    fireEvent.click(within(inspector()).getAllByRole("button", { name: "Provenance" })[0] as HTMLElement);
    expect(document.querySelector(".term-pop")?.textContent).toBe(
      "provenanceA signed record that shows where a package was built. If it suddenly goes missing, be suspicious.",
    );
    fireEvent.pointerDown(document.body);
    expect(document.querySelector(".term-pop")).toBeNull();
  });
});

describe("the Footer bar and the site footer (16.3 to 16.16)", () => {
  it("shows the History label, the range with its ends and Watch a real attack; Back to now only at an earlier date", async () => {
    const { container } = mount();
    await ready();
    const bar = container.querySelector("footer.foot-bar") as HTMLElement;
    expect(bar.querySelector("label")?.textContent).toBe("History");
    expect(bar.querySelector(".scrub-ends")?.textContent).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}Today, 12 Nov 2026$/);
    expect(within(bar).queryByRole("button", { name: "Back to now" })).toBeNull();
    expect(within(bar).queryByRole("button", { name: "Play" })).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "History date" }), { target: { value: "1" } });
    fireEvent.click(within(bar).getByRole("button", { name: "Back to now" }));
    expect((screen.getByRole("slider", { name: "History date" }) as HTMLInputElement).value).toBe((screen.getByRole("slider", { name: "History date" }) as HTMLInputElement).max);
  });

  it("shows only Watch a real attack with no timelines, and closes the picker on a press outside", async () => {
    const { container } = mount({ body: JSON.stringify(cheapScan(2)) });
    await ready();
    const bar = container.querySelector("footer.foot-bar") as HTMLElement;
    expect([...bar.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Watch a real attack"]);
    fireEvent.click(within(bar).getByRole("button", { name: "Watch a real attack" }));
    expect(document.getElementById("attack-pop")).not.toBeNull();
    fireEvent.pointerDown(container.querySelector("h1") as HTMLElement);
    expect(document.getElementById("attack-pop")).toBeNull();
  });

  it("matches each replay card to its fixture and its Stops", () => {
    for (const id of REPLAY_IDS) {
      const response = readReplay(id) as ScanResponse;
      expect(REPLAY_CARD[id].package).toBe(response.report.packages[0]?.name);
      expect(REPLAY_CARD[id].steps).toBe(stopsFor(response).stops.length);
      expect(response.replay?.title).toContain(REPLAY_CARD[id].date);
    }
  });

  it("shows the scan time, the policy line and the evidence links in one line of the site footer (16.12)", async () => {
    const { container } = mount();
    await ready();
    const footer = container.querySelector("footer.site-footer") as HTMLElement;
    expect(footer.querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-12T00:00:00.000Z");
    expect(footer.textContent).toMatch(/policy: (pass|fail), (default policy|policy file), \d+ failing rules?/);
    expect([...footer.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Evidence JSON", "Evidence Markdown"]);
  });

  it("reserves the measured Footer bar and site footer under the Scene, and nothing when none is measured", () => {
    expect(reserveFor([])).toBe(0);
    expect(reserveFor([0, 0])).toBe(0);
    expect(reserveFor([57.2, 30])).toBe(58 + 30 + RESERVE_GAPS);
    expect(reserveFor([Number.NaN, 40])).toBe(40 + RESERVE_GAPS);
  });
});

describe("the Welcome bar (9.5 to 9.9, 9.11)", () => {
  it("shows under the header with no stored choice, and its close button stores closed", async () => {
    const { container } = mount();
    await ready();
    const bar = container.querySelector(".welcome") as HTMLElement;
    expect(bar.previousElementSibling?.tagName).toBe("HEADER");
    expect(bar.textContent).toBe("New here? Read the two-minute guide first. It explains what Sexton is and what the graves mean.Read the guide");
    fireEvent.click(within(bar).getByRole("button", { name: "Close the welcome bar" }));
    expect(container.querySelector(".welcome")).toBeNull();
    expect(window.localStorage.getItem(WELCOME_KEY)).toBe("closed");
  });

  it("stays hidden once closed is stored", async () => {
    window.localStorage.setItem(WELCOME_KEY, "closed");
    const { container } = mount();
    await ready();
    expect(container.querySelector(".welcome")).toBeNull();
  });

  it("opens the Guide page from Read the guide, stores closed, and Go to the cemetery comes back without a reload", async () => {
    const { container, urls } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Read the guide" }));
    expect(window.localStorage.getItem(WELCOME_KEY)).toBe("closed");
    expect(container.querySelector(".welcome")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.textContent).toBe("← Cemetery/What is Sexton?");
    expect(container.querySelector("h1")?.textContent).toBe("Sexton looks after the code your app borrows.");
    fireEvent.click(screen.getByRole("button", { name: "Go to the cemetery" }));
    expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
    expect(urls).toHaveLength(1);
  });

  it("hides for the page load with no error when storage refuses (9.8)", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      const { container } = mount();
      await ready();
      fireEvent.click(screen.getByRole("button", { name: "Close the welcome bar" }));
      expect(container.querySelector(".welcome")).toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      if (original !== undefined) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("one owner of what is open (17.1 to 17.3, 10.3)", () => {
  it("takes the Guide page home on Escape, and closes the one open Pop-over first", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "What is Sexton?" }));
    expect(container.querySelector(".guide")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(container.querySelector(".guide")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
    // Opening the Legend, then the attack picker, keeps one Pop-over.
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    fireEvent.click(screen.getByRole("button", { name: "Watch a real attack" }));
    expect(screen.getByRole("button", { name: "Legend" }).getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("attack-pop")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.getElementById("attack-pop")).toBeNull();
  });

  it("takes a Replay home on Escape and loads the Sample scan again (10.3)", async () => {
    const urls: string[] = [];
    const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      return Promise.resolve(new Response(url.endsWith("/replay/axios.json") ? readReplayText("axios") : readDemoScanText(), { status: 200 }));
    }) as typeof fetch;
    const { container } = render(<App fetchFn={fetchFn} apiBase={null} initialSearch="?replay=axios" pageOrigin={ORIGIN} />);
    await ready();
    expect(container.querySelector("h1")?.textContent).toBe("Watch the axios attack unfold");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
    });
    expect(urls).toEqual([`${ORIGIN}/replay/axios.json`, `${ORIGIN}/demo/scan.json`]);
    expect(container.querySelector("header .scan-tag")?.textContent).toBe("Sample scan");
  });

  it("takes the Tour home in the Graveyard view and walks its three steps with Skip, Next and Done (13.3, 13.7, 13.9, 13.10)", async () => {
    const { container } = mount({ apiBase: null });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Tour" }));
    expect(container.querySelector("canvas:not(.ghost-picture)")).not.toBeNull();
    const card = (): HTMLElement => container.querySelector(".tour-card") as HTMLElement;
    expect(card().textContent).toContain("Step 1 of 3");
    expect(card().textContent).toContain("Every grave is one dependency");
    fireEvent.click(within(card()).getByRole("button", { name: "Next" }));
    expect(card().textContent).toContain("One panel, always in the same place");
    fireEvent.click(within(card()).getByRole("button", { name: "Next" }));
    expect(card().textContent).toContain("Scanning is off in this build. The hosted site scans public GitHub repos with a package.json at the top.");
    fireEvent.click(within(card()).getByRole("button", { name: "Done" }));
    expect(container.querySelector(".tour-card")).toBeNull();
  });
});

describe("the scanning card (1.14)", () => {
  it("digs through the repository with three fixed lines and no progress bar while a Live scan loads", async () => {
    const { container } = mount({ apiBase: API, pending: true });
    await ready();
    fireEvent.change(screen.getByLabelText("GitHub repository to scan"), { target: { value: "expressjs/express" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const card = await screen.findByRole("status");
    expect(card.querySelector("h2")?.textContent).toBe("Digging through expressjs/express");
    expect(card.textContent).toContain("This usually takes a few seconds.");
    expect([...card.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Reading package.json and the lockfile",
      "Asking npm, OSV and deps.dev",
      "Reading each headstone",
    ]);
    expect(card.querySelector('[role="progressbar"], progress, .bar')).toBeNull();
    expect(container.querySelector("header .scan-tag")?.textContent).toBe("expressjs/express");
  });
});
