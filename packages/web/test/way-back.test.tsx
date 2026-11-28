// Spec clean-site, requirement 10 and 17.4: the way back and the addresses. The still-valid cases of spec
// calm-first-visit's way-back test (the wordmark, Exit replay, Back and Forward, the address, the repository prompt and
// its review regressions), moved to the new views, and the cases of the views this spec adds.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { BACK_TO_CEMETERY } from "../src/home/FailureCard.js";
import { SCAN_FIELD_NAME, SCAN_PROMPT_TEXT } from "../src/header/ScanField.js";
import { GUIDE_BUTTON_TEXT } from "../src/header/Header.js";
import { NO_SUCH_REPLAY_TEXT } from "../src/load/scan-failure.js";
import { SCANNED_KEY } from "../src/load/scanned-pref.js";
import { EXIT_REPLAY } from "../src/replay/replay-story.js";
import { readDemoScan, readDemoScanText } from "./support/demo-scan.js";
import { readReplayText } from "./support/replay-fixture.js";

// A fresh entry at the start of each case drops any forward entries an earlier case left, so lengths compare.
beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    window.sessionStorage.clear();
  } catch {
    // none
  }
});

const ORIGIN = "http://localhost";
const API = "/api";
const WORDMARK_NAME = "Sexton, home page";
const REPO = "https://github.com/a/b";
// Spec home-page, 1.7: a Live scan's repo value is its owner/name.
const REPO_QUERY = "?repo=a/b";

function fetchAll(seen: string[] = []): typeof fetch {
  return ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    seen.push(url);
    const path = new URL(url, ORIGIN).pathname;
    const body = path.startsWith("/replay/axios") ? readReplayText("axios") : path.startsWith("/replay/keyv") ? readReplayText("keyv") : readDemoScanText();
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof fetch;
}

function mount(search = "", options: { apiBase?: string | null; seen?: string[]; onNavigate?: (to: string) => void } = {}) {
  return render(
    <App
      fetchFn={fetchAll(options.seen)}
      apiBase={options.apiBase ?? null}
      initialSearch={search}
      pageOrigin={ORIGIN}
      {...(options.onNavigate !== undefined ? { onNavigate: options.onNavigate } : {})}
    />,
  );
}

function crumbHome(): void {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: /Cemetery/ }));
}

function tag(): string | null | undefined {
  return document.querySelector(".scan-tag")?.textContent;
}

async function ready(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector("button[data-grave-index]")).not.toBeNull();
  });
}

async function onSample(): Promise<void> {
  await waitFor(() => {
    expect(tag()).toBe("Sample scan");
    expect(document.querySelector(".replay-view")).toBeNull();
    expect(document.querySelector("main.guide")).toBeNull();
    expect(document.querySelector("button[data-grave-index]")).not.toBeNull();
  });
}

async function onReplay(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(".replay-view .replay-stage")).not.toBeNull();
  });
}

async function settle(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function wordmark(): HTMLAnchorElement {
  return screen.getByRole("link", { name: WORDMARK_NAME }) as HTMLAnchorElement;
}

function grave(i = 0): HTMLElement {
  return document.querySelector<HTMLElement>(`button[data-grave-index="${String(i)}"]`) as HTMLElement;
}

function field(): HTMLInputElement {
  return screen.getByLabelText(SCAN_FIELD_NAME) as HTMLInputElement;
}

function scanRepo(value: string): void {
  fireEvent.change(field(), { target: { value } });
  fireEvent.submit(field().closest("form") as HTMLFormElement);
}

function pickReplay(name: "axios" | "keyv"): void {
  fireEvent.click(screen.getByRole("button", { name: "Watch a real attack" }));
  const pop = document.getElementById("attack-pop") as HTMLElement;
  const button = [...pop.querySelectorAll<HTMLButtonElement>("button.attack")].find((b) => (b.textContent ?? "").startsWith(name));
  fireEvent.click(button as HTMLButtonElement);
}

/** The demo's Stops as ISO instants, oldest first. */
function demoStops(): string[] {
  const slider = screen.getByRole("slider", { name: "History date" }) as HTMLInputElement;
  return Array.from({ length: Number(slider.max) + 1 }, (_, i) => {
    fireEvent.change(slider, { target: { value: String(i) } });
    return new URLSearchParams(window.location.search).get("at") ?? "";
  });
}

// Spec home-page, 12.1 to 12.3: the wordmark goes to the Home page at "/"; the breadcrumbs keep the Home action.
describe("the wordmark goes to the Home page (spec home-page, 12.1)", () => {
  it("is a link to / named for the Home page", async () => {
    mount();
    await ready();
    expect(wordmark().getAttribute("href")).toBe("/");
  });

  it("moves to / through the Route on a plain press, from Home and from a Replay", async () => {
    const onNavigate = vi.fn();
    mount("", { onNavigate });
    await ready();
    fireEvent.click(wordmark(), { button: 0 });
    expect(onNavigate).toHaveBeenCalledWith("/");
    cleanup();
    mount("?replay=axios", { onNavigate });
    await onReplay();
    fireEvent.click(wordmark(), { button: 0 });
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("leaves a modifier-key press to the browser", async () => {
    const onNavigate = vi.fn();
    mount("?replay=axios", { onNavigate });
    await onReplay();
    const allowed = fireEvent.click(wordmark(), { metaKey: true });
    expect(allowed).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(document.querySelector(".replay-view")).not.toBeNull();
  });

  it("goes from a Replay to Home by its breadcrumb without a reload, and Back returns to the Replay", async () => {
    mount("?replay=axios");
    await onReplay();
    crumbHome();
    await onSample();
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/cemetery");
    window.history.back();
    await onReplay();
    expect(window.location.search).toBe("?replay=axios");
  });

  it("keeps the List choice made on Home (the Home start) when a breadcrumb goes home", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(window.location.search).toBe("?view=list");
    pickReplay("keyv");
    await onReplay();
    crumbHome();
    await waitFor(() => expect(window.location.search).toBe("?view=list"));
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the breadcrumbs and Exit replay (10.1, 10.2, 10.14)", () => {
  it("goes home from Exit replay and from the Replay's breadcrumb", async () => {
    mount("?replay=keyv");
    await onReplay();
    fireEvent.click(screen.getByRole("button", { name: EXIT_REPLAY }));
    await onSample();
    cleanup();
    mount("?replay=keyv");
    await onReplay();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: /Cemetery/ }));
    await onSample();
  });

  it("closes only the Drawer from its breadcrumb, and goes back over the Drawer's entry (10.17)", async () => {
    mount("?view=list");
    await ready();
    const before = window.history.length;
    fireEvent.click(document.querySelector<HTMLElement>("tr button[data-grave-index]") as HTMLElement);
    expect(window.history.length).toBe(before + 1);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Cemetery/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(window.location.search).toBe("?view=list"));
    expect(document.querySelector("table")).not.toBeNull();
  });

  it("opens the Guide page with page=guide, keeps repo= in it, and its breadcrumb goes home with a new entry", async () => {
    const seen: string[] = [];
    mount("", { apiBase: API, seen });
    await ready();
    scanRepo(REPO);
    await waitFor(() => expect(tag()).toBe("a/b"));
    fireEvent.click(screen.getByRole("button", { name: GUIDE_BUTTON_TEXT }));
    expect(window.location.search).toBe(`${REPO_QUERY}&page=guide`);
    const before = window.history.length;
    fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: /Cemetery/ }));
    expect(window.location.search).toBe(REPO_QUERY);
    expect(window.history.length).toBe(before + 1);
    await waitFor(() => expect(tag()).toBe("a/b"));
    expect(seen.filter((u) => u.includes("/api/scan")).length).toBe(1);
  });
});

describe("Back, Forward and the address (10.4 to 10.9, 10.15 to 10.17)", () => {
  it("adds an entry for a Replay from the attack picker, and Back returns to the Sample scan", async () => {
    mount();
    await ready();
    pickReplay("axios");
    await onReplay();
    expect(window.location.search).toBe("?replay=axios");
    window.history.back();
    await onSample();
    window.history.forward();
    await onReplay();
  });

  it("adds an entry for the List switch, and Back returns to the Graveyard", async () => {
    mount();
    await ready();
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(window.location.search).toBe("?view=list");
    expect(window.history.length).toBe(before + 1);
    window.history.back();
    await waitFor(() => expect(document.querySelector("table")).toBeNull());
    expect(window.location.search).toBe("");
  });

  it("opens the Guide page and Back and Forward move between it and Home; Escape goes home with a new entry", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: GUIDE_BUTTON_TEXT }));
    expect(window.location.search).toBe("?page=guide");
    window.history.back();
    await onSample();
    window.history.forward();
    await waitFor(() => expect(document.querySelector("main.guide")).not.toBeNull());
    const before = window.history.length;
    fireEvent.keyDown(document.body, { key: "Escape" });
    await onSample();
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(before + 1);
  });

  it("names the open Drawer in the address, and Back closes it and returns focus to its grave", async () => {
    mount();
    await ready();
    fireEvent.click(grave());
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(new URLSearchParams(window.location.search).get("grave")).toBe("left-padder");
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(grave());
    window.history.forward();
    await waitFor(() => expect(screen.getByRole("dialog")).not.toBeNull());
  });

  it("goes back one entry when Escape closes a Drawer it opened", async () => {
    mount();
    await ready();
    const before = window.history.length;
    fireEvent.click(grave());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await settle();
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.history.length).toBe(before + 1);
  });

  it("keeps a chosen date when Escape closes the Drawer", async () => {
    mount();
    await ready();
    const first = demoStops()[0] ?? "";
    expect(new URLSearchParams(window.location.search).get("at")).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "History date" }), { target: { value: "0" } });
    expect(new URLSearchParams(window.location.search).get("at")).toBe(first);
    fireEvent.click(grave());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("grave")).toBe(false));
    await settle();
    expect(new URLSearchParams(window.location.search).get("at")).toBe(first);
    expect((screen.getByRole("slider", { name: "History date" }) as HTMLInputElement).value).toBe("0");
  });

  it("keeps a Replay chosen in the same tick as a Drawer close", async () => {
    mount();
    await ready();
    fireEvent.click(grave());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    pickReplay("axios");
    await onReplay();
    await settle();
    await waitFor(() => expect(window.location.search).toBe("?replay=axios"));
    expect(document.querySelector(".replay-view")).not.toBeNull();
    window.history.back();
    await onSample();
    expect(window.location.search).toBe("");
  });

  it("keeps an entry's date and grave on Back from a Replay, checked against its own scan (review defect)", async () => {
    mount();
    await ready();
    const first = demoStops()[0] ?? "";
    fireEvent.change(screen.getByRole("slider", { name: "History date" }), { target: { value: "0" } });
    expect(new URLSearchParams(window.location.search).get("at")).toBe(first);
    pickReplay("axios");
    await onReplay();
    window.history.back();
    await onSample();
    await settle();
    expect(new URLSearchParams(window.location.search).get("at")).toBe(first);
    expect((screen.getByRole("slider", { name: "History date" }) as HTMLInputElement).value).toBe("0");
    fireEvent.click(grave());
    const drawerAddress = window.location.search;
    fireEvent.click(screen.getByRole("button", { name: GUIDE_BUTTON_TEXT }));
    window.history.back();
    await waitFor(() => expect(window.location.search).toBe(`?at=${encodeURIComponent(first)}`));
    expect(drawerAddress).toContain("grave=left-padder");
  });

  it("puts a new View in place of the Drawer's entry when one opens over the Drawer", async () => {
    mount();
    await ready();
    const before = window.history.length;
    fireEvent.click(grave());
    fireEvent.click(screen.getByRole("button", { name: GUIDE_BUTTON_TEXT }));
    expect(window.location.search).toBe("?page=guide");
    expect(window.history.length).toBe(before + 1);
    window.history.back();
    await onSample();
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the Sample scan, not the scan file, for a repository link that also names scan", async () => {
    const seen: string[] = [];
    mount(`${REPO_QUERY}&scan=%2Fother.json`, { apiBase: API, seen });
    await onSample();
    expect(seen.some((u) => u.includes("other.json"))).toBe(false);
    expect(screen.getByRole("button", { name: SCAN_PROMPT_TEXT })).not.toBeNull();
  });

  it("opens the Drawer and the date a shared link names, and drops a grave or date the scan lacks with a replace", async () => {
    mount();
    await ready();
    const stop = demoStops()[1] ?? "";
    cleanup();
    mount(`?grave=lodash&at=${encodeURIComponent(stop)}`);
    await waitFor(() => expect(screen.getByRole("dialog")).not.toBeNull());
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 2 }).textContent).toContain("lodash");
    expect((screen.getByRole("slider", { name: "History date" }) as HTMLInputElement).value).toBe("1");
    cleanup();
    const before = window.history.length;
    mount("?grave=not-a-package&at=2001-01-01T00%3A00%3A00.000Z");
    await ready();
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.history.length).toBe(before);
  });

  it("drops the parts a view does not take (10.9)", async () => {
    mount("?replay=axios&grave=axios&view=list");
    await onReplay();
    expect(window.location.search).toBe("?replay=axios");
    cleanup();
    mount("?page=guide&grave=lodash");
    await waitFor(() => expect(document.querySelector("main.guide")).not.toBeNull());
    expect(window.location.search).toBe("?page=guide");
  });

  it("keeps the last date chosen when moves come in quick succession", async () => {
    mount();
    await ready();
    const slider = screen.getByRole("slider", { name: "History date" }) as HTMLInputElement;
    const last = slider.max;
    fireEvent.change(slider, { target: { value: "0" } });
    fireEvent.change(slider, { target: { value: last } });
    fireEvent.change(slider, { target: { value: "0" } });
    await settle();
    await settle();
    expect(slider.value).toBe("0");
    expect(new URLSearchParams(window.location.search).get("at")).not.toBeNull();
  });

  it("puts the chosen date in the address with no new entry (10.8), and Back to now takes it out", async () => {
    mount();
    await ready();
    const before = window.history.length;
    fireEvent.change(screen.getByRole("slider", { name: "History date" }), { target: { value: "1" } });
    expect(new URLSearchParams(window.location.search).get("at")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to now" }));
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(before);
  });

  it("leaves the address and the history alone on a Step or a Drawer tab change (10.16)", async () => {
    mount("?replay=axios");
    await onReplay();
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(window.location.search).toBe("?replay=axios");
    expect(window.history.length).toBe(before);
    cleanup();
    mount();
    await ready();
    fireEvent.click(grave());
    const opened = window.location.search;
    const length = window.history.length;
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    fireEvent.click(screen.getByRole("tab", { name: "The fix" }));
    expect(window.location.search).toBe(opened);
    expect(window.history.length).toBe(length);
  });
});

describe("a repository link waits for a press (10.11 to 10.13, 10.18)", () => {
  it("fills the field, shows Scan this repository and sends no request; the press starts the Live scan", async () => {
    const seen: string[] = [];
    mount(REPO_QUERY, { apiBase: API, seen });
    await ready();
    await waitFor(() => expect(field().value).toBe(REPO));
    expect(screen.getAllByRole("button", { name: SCAN_PROMPT_TEXT })).toHaveLength(1);
    expect(tag()).toBe("Sample scan");
    expect(seen.some((u) => u.includes("/api/scan"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: SCAN_PROMPT_TEXT }));
    await waitFor(() => expect(seen.some((u) => u.endsWith(`${API}/scan?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb`))).toBe(true));
    expect(window.sessionStorage.getItem(SCANNED_KEY)).toBe(REPO);
    expect(screen.queryByRole("button", { name: SCAN_PROMPT_TEXT })).toBeNull();
    await waitFor(() => expect(tag()).toBe("a/b"));
    expect(window.location.search).toBe(REPO_QUERY);
  });

  it("starts the Live scan on a reload of the tab where the visitor started it (10.12)", async () => {
    window.sessionStorage.setItem(SCANNED_KEY, REPO);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "reload" } as PerformanceNavigationTiming]);
    const seen: string[] = [];
    mount(REPO_QUERY, { apiBase: API, seen });
    await waitFor(() => expect(seen.some((u) => u.endsWith(`${API}/scan?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb`))).toBe(true));
    expect(screen.queryByRole("button", { name: SCAN_PROMPT_TEXT })).toBeNull();
    await waitFor(() => expect(tag()).toBe("a/b"));
  });

  it("waits for a press in a fresh tab even after a scan of the same repository elsewhere", async () => {
    window.sessionStorage.setItem(SCANNED_KEY, REPO);
    const seen: string[] = [];
    mount(REPO_QUERY, { apiBase: API, seen });
    await ready();
    await waitFor(() => expect(screen.getByRole("button", { name: SCAN_PROMPT_TEXT })).not.toBeNull());
    expect(seen.some((u) => u.includes("/api/scan"))).toBe(false);
  });

  it("gives Home and / for a repository with no API base", async () => {
    mount(REPO_QUERY);
    await ready();
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("button", { name: SCAN_PROMPT_TEXT })).toBeNull();
  });

  it("adds one entry for a Live scan, and shows a held scan on Back and Forward with no new request", async () => {
    const seen: string[] = [];
    mount("", { apiBase: API, seen });
    await ready();
    const before = window.history.length;
    scanRepo(REPO);
    await waitFor(() => expect(tag()).toBe("a/b"));
    expect(window.location.search).toBe(REPO_QUERY);
    expect(window.history.length).toBe(before + 1);
    window.history.back();
    await onSample();
    const requests = seen.filter((u) => u.includes("/api/scan")).length;
    window.history.forward();
    await waitFor(() => expect(tag()).toBe("a/b"));
    await ready();
    expect(seen.filter((u) => u.includes("/api/scan")).length).toBe(requests);
  });

  it("closes a Live scan's Drawer on Back with no request, and returns focus to its grave", async () => {
    const seen: string[] = [];
    mount("", { apiBase: API, seen });
    await ready();
    scanRepo(REPO);
    await waitFor(() => expect(tag()).toBe("a/b"));
    await ready();
    fireEvent.click(grave());
    expect(screen.getByRole("dialog")).not.toBeNull();
    const requests = seen.length;
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(grave());
    expect(seen.length).toBe(requests);
  });

  it("leaves the prompt for the Home page when the wordmark is pressed (spec home-page, 12.1)", async () => {
    const onNavigate = vi.fn();
    mount(REPO_QUERY, { apiBase: API, onNavigate });
    await ready();
    await waitFor(() => expect(screen.getByRole("button", { name: SCAN_PROMPT_TEXT })).not.toBeNull());
    fireEvent.click(wordmark(), { button: 0 });
    expect(onNavigate).toHaveBeenCalledWith("/");
  });
});

describe("an unknown replay (10.10)", () => {
  it("loads nothing, shows its card, and Back to the cemetery loads the Sample scan", async () => {
    const seen: string[] = [];
    mount("?replay=nope", { seen });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(NO_SUCH_REPLAY_TEXT));
    expect(seen).toEqual([]);
    expect(tag()).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: BACK_TO_CEMETERY }));
    await onSample();
    expect(window.location.search).toBe("");
    expect(seen).toEqual([`${ORIGIN}/demo/scan.json`]);
  });

  it("reaches the Home page from the wordmark too (spec home-page, 12.1)", async () => {
    const onNavigate = vi.fn();
    mount("?replay=nope", { onNavigate });
    await waitFor(() => expect(screen.getByRole("alert")).not.toBeNull());
    fireEvent.click(wordmark(), { button: 0 });
    expect(onNavigate).toHaveBeenCalledWith("/");
  });
});

describe("the demo fixture the cases rely on", () => {
  it("has left-padder first and lodash among its packages", () => {
    const names = (readDemoScan() as { report: { packages: { name: string }[] } }).report.packages.map((p) => p.name);
    expect(names).toContain("left-padder");
    expect(names).toContain("lodash");
  });
});
