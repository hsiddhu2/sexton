// Spec home-page, tasks 2.3 and 2.4: the scan cache in the Cemetery view (design C5 and C6, requirements 13 and 14).
// No network: every request goes to a recording stub.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { addScan, CACHE_KEY, parseStore, serialise, TTL_MS } from "../src/cache/scan-cache.js";
import { CACHED_TICK_MS, RESCAN_TEXT } from "../src/home/CachedLine.js";
import { SCAN_FIELD_NAME, SCAN_PROMPT_TEXT } from "../src/header/ScanField.js";
import { CLEAR_TEXT, RECENT_HEADING } from "../src/home-page/RecentScans.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScanText } from "./support/demo-scan.js";

const ORIGIN = "http://localhost";
const API = "/api";
const T0 = 1_795_000_000_000;

afterEach(() => {
  cleanup();
  try {
    window.sessionStorage.clear();
  } catch {
    // none
  }
});

function recorder() {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    const body = url.includes("/scan?repo=") ? JSON.stringify(cheapScan(3)) : readDemoScanText();
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof fetch;
  return { urls, fetchFn, scans: () => urls.filter((u) => u.includes("/scan?repo=")).length };
}

function seed(label: string, savedAt: number): void {
  window.localStorage.setItem(CACHE_KEY, serialise(addScan([], label, cheapScan(2), savedAt)));
}

function mount(search: string, options: { now?: () => number; startScan?: boolean } = {}) {
  const rec = recorder();
  const clock = options.now ?? (() => T0);
  const view = render(<App fetchFn={rec.fetchFn} apiBase={API} initialSearch={search} pageOrigin={ORIGIN} now={clock} startScan={options.startScan ?? false} />);
  return { rec, view };
}

async function graves(count: number): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll("button[data-grave-index]").length).toBe(count);
  });
}

describe("a Fresh Entry shows with no request (13.2, 13.3)", () => {
  it("shows the saved scan, its age and Rescan, and Rescan sends exactly one request and saves it", async () => {
    seed("a/b", T0 - 2 * 60_000);
    let now = T0;
    const { rec } = mount("?repo=a/b", { now: () => now });
    await graves(2);
    expect(rec.scans()).toBe(0);
    expect(screen.getByText("Scanned 2 min ago")).not.toBeNull();
    now = T0 + 60_000;
    fireEvent.click(screen.getByRole("button", { name: RESCAN_TEXT }));
    await graves(3);
    expect(rec.scans()).toBe(1);
    expect(screen.queryByRole("button", { name: RESCAN_TEXT })).toBeNull();
    const stored = parseStore(window.localStorage.getItem(CACHE_KEY));
    expect(stored.map((e) => [e.label, e.savedAt])).toEqual([["a/b", T0 + 60_000]]);
  });

  it("reads an old github.com link address as the same repository", async () => {
    seed("a/b", T0 - 1000);
    const { rec } = mount("?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb");
    await graves(2);
    expect(rec.scans()).toBe(0);
    expect(screen.getByText("Scanned just now")).not.toBeNull();
  });

  it("updates the age at least once a minute", async () => {
    seed("a/b", T0);
    let now = T0;
    mount("?repo=a/b", { now: () => now });
    await graves(2);
    expect(screen.getByText("Scanned just now")).not.toBeNull();
    now = T0 + 3 * 60_000;
    await act(() => new Promise((resolve) => setTimeout(resolve, CACHED_TICK_MS + 50)));
    expect(screen.getByText("Scanned 3 min ago")).not.toBeNull();
  }, 40_000);

  it("shows the saved scan with no request when the header Scan field names it", async () => {
    seed("a/b", T0 - 1000);
    const { rec } = mount("");
    await graves(12);
    fireEvent.change(screen.getByLabelText(SCAN_FIELD_NAME), { target: { value: "A/B" } });
    fireEvent.submit(screen.getByLabelText(SCAN_FIELD_NAME).closest("form") as HTMLFormElement);
    await graves(2);
    expect(rec.scans()).toBe(0);
    expect(window.location.pathname).toBe("/scan");
    expect(window.location.search).toBe("?repo=A/B");
  });
});

describe("a request aborted by a saved response is not saved (13.1, review defect)", () => {
  it("keeps the old save time when the header shows the saved scan while a Rescan is in flight", async () => {
    seed("a/b", T0 - 10 * 60_000);
    let scanned = 0;
    const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (!url.includes("/scan?repo=")) return Promise.resolve(new Response(readDemoScanText(), { status: 200 }));
      scanned += 1;
      // The Rescan request: answered only after the saved scan is shown again.
      return new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(cheapScan(3)), { status: 200 })), 50));
    }) as typeof fetch;
    render(<App fetchFn={fetchFn} apiBase={API} initialSearch="?repo=a/b" pageOrigin={ORIGIN} now={() => T0} />);
    await graves(2);
    fireEvent.click(screen.getByRole("button", { name: RESCAN_TEXT }));
    fireEvent.change(screen.getByLabelText(SCAN_FIELD_NAME), { target: { value: "a/b" } });
    fireEvent.submit(screen.getByLabelText(SCAN_FIELD_NAME).closest("form") as HTMLFormElement);
    await graves(2);
    await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
    expect(scanned).toBe(1);
    expect(parseStore(window.localStorage.getItem(CACHE_KEY)).map((e) => e.savedAt)).toEqual([T0 - 10 * 60_000]);
    expect(screen.getByText("Scanned 10 min ago")).not.toBeNull();
  });
});

describe("without a Fresh Entry (13.5)", () => {
  it("waits for a press on an address alone, even with an Entry older than 15 minutes", async () => {
    seed("a/b", T0 - TTL_MS);
    const { rec } = mount("?repo=a/b");
    await graves(12);
    await waitFor(() => expect(screen.getByRole("button", { name: SCAN_PROMPT_TEXT })).not.toBeNull());
    expect(rec.scans()).toBe(0);
  });

  it("starts the scan at once after a press on the Home page, and saves the result", async () => {
    const { rec } = mount("?repo=a/b", { startScan: true });
    await graves(3);
    expect(rec.scans()).toBe(1);
    expect(parseStore(window.localStorage.getItem(CACHE_KEY)).map((e) => [e.key, e.savedAt])).toEqual([["a/b", T0]]);
    expect(screen.queryByRole("button", { name: RESCAN_TEXT })).toBeNull();
  });
});

describe("Recent scans in the header example list (14.2 to 14.5)", () => {
  it("lists the Entries with their ages above Try one, scans from a row, and Clear empties the store", async () => {
    window.localStorage.setItem(CACHE_KEY, serialise(addScan(addScan([], "o/old", cheapScan(2), T0 - 2 * 3_600_000), "a/b", cheapScan(2), T0 - 5 * 60_000)));
    const { rec } = mount("");
    await graves(12);
    fireEvent.focus(screen.getByLabelText(SCAN_FIELD_NAME));
    const group = screen.getByRole("group", { name: RECENT_HEADING });
    expect([...group.querySelectorAll(".recent-row")].map((b) => b.textContent)).toEqual(["a/b5 min ago", "o/old2 h ago"]);
    const pop = group.closest(".examples") as HTMLElement;
    expect(pop.querySelector(".pop-heading")?.textContent).toBe("Try one");
    expect(group.compareDocumentPosition(pop.querySelector(".pop-heading") as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: CLEAR_TEXT }));
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(screen.queryByRole("group", { name: RECENT_HEADING })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText(SCAN_FIELD_NAME));
    expect(rec.scans()).toBe(0);
  });

  it("shows the saved scan from a row with no request", async () => {
    seed("a/b", T0 - 1000);
    const { rec } = mount("");
    await graves(12);
    fireEvent.focus(screen.getByLabelText(SCAN_FIELD_NAME));
    fireEvent.click(within(screen.getByRole("group", { name: RECENT_HEADING })).getByRole("button", { name: /a\/b/ }));
    await graves(2);
    expect(rec.scans()).toBe(0);
  });

  it("shows no Recent scans heading and no Clear with an empty store", async () => {
    mount("");
    await graves(12);
    fireEvent.focus(screen.getByLabelText(SCAN_FIELD_NAME));
    expect(screen.queryByRole("group", { name: RECENT_HEADING })).toBeNull();
    expect(screen.queryByRole("button", { name: CLEAR_TEXT })).toBeNull();
  });
});

describe("storage blocked (13.9)", () => {
  it("scans normally and shows no error when every localStorage call throws", async () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      const { rec } = mount("?repo=a/b", { startScan: true });
      await graves(3);
      expect(rec.scans()).toBe(1);
      fireEvent.focus(screen.getByLabelText(SCAN_FIELD_NAME));
      expect(screen.queryByRole("group", { name: RECENT_HEADING })).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      if (real !== undefined) Object.defineProperty(window, "localStorage", real);
    }
  });
});
