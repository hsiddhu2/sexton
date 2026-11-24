import type { PackageHealth, ReplayInfo, ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { Drawer } from "../src/drawer/Drawer.js";
import { drawerModel } from "../src/drawer/drawer-model.js";
import { Header } from "../src/header/Header.js";
import { checkScanUrl } from "../src/load/check-scan-url.js";
import { REPLAY_BANNER_TEXT } from "../src/replay/ReplayBanner.js";
import { REPLAY_IDS, parseReplayParam, replayAddress, type ReplayId } from "../src/replay/replay-ids.js";
import { stopsFor } from "../src/time/stops.js";
import { EIGHT_URLS, EXPECTED_SEGMENTS, readReplay, readReplayText } from "./support/replay-fixture.js";

afterEach(cleanup);
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});

const ORIGIN = "http://localhost";

interface Mounted {
  readonly urls: string[];
  readonly container: HTMLElement;
}
function mount(search: string): Mounted {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    const id = REPLAY_IDS.find((r) => url === `${ORIGIN}${replayAddress(r)}`);
    return Promise.resolve(
      id === undefined ? new Response("not found", { status: 404 }) : new Response(readReplayText(id), { status: 200 }),
    );
  }) as typeof fetch;
  const { container } = render(<App fetchFn={fetchFn} apiBase="https://api.example" initialSearch={search} pageOrigin={ORIGIN} />);
  return { urls, container };
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
const grave = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>("button[data-grave-index]") as HTMLElement;
const label = (container: HTMLElement): string => grave(container).getAttribute("aria-label") ?? "";

const STOP_TEXT = {
  axios: ["30 Mar 2026, 23:21 UTC", "31 Mar 2026, 00:21 UTC", "31 Mar 2026, 03:29 UTC"],
  keyv: ["4 Aug 2026, 08:35 UTC", "4 Aug 2026, 09:35 UTC"],
} as const;

describe("opening a replay (requirement 18)", () => {
  it("renders the Replay group after the Scan button with the two button texts", async () => {
    mount("");
    await ready();
    const group = screen.getByRole("group", { name: "Replay an attack" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["axios, Mar 2026", "keyv, Aug 2026"]);
    const scan = screen.getByRole("button", { name: "Scan" });
    expect(scan.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the group with the visible label Replay an attack (spec cemetery-time-fixes, 8.1)", async () => {
    mount("");
    await ready();
    const group = screen.getByRole("group", { name: "Replay an attack" });
    const label = group.querySelector(".replay-label") as HTMLElement;
    expect(label.textContent).toBe("Replay an attack");
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
    expect(group.hasAttribute("aria-label")).toBe(false);
    expect(group.firstElementChild).toBe(label);
  });

  it("loads each fixture from the page origin when its button is pressed, then a second one from the header", async () => {
    const { urls, container } = mount("");
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "axios, Mar 2026" }));
    await waitFor(() => {
      expect(label(container)).toBe("axios 1.14.0, Alive");
    });
    expect(urls).toEqual([`${ORIGIN}/demo/scan.json`, `${ORIGIN}/replay/axios.json`]);
    fireEvent.click(screen.getByRole("button", { name: "keyv, Aug 2026" }));
    await waitFor(() => {
      expect(label(container)).toBe("keyv 5.6.0, Alive");
    });
    expect(urls[2]).toBe(`${ORIGIN}/replay/keyv.json`);
    // The scrubber is at the first Stop of the replay.
    expect(slider().getAttribute("aria-valuetext")).toBe(STOP_TEXT.keyv[0]);
  });

  it("loads the matching fixture for ?replay=axios and ?replay=keyv instead of the demo", async () => {
    for (const id of REPLAY_IDS) {
      const { urls, container } = mount(`?replay=${id}`);
      await ready();
      expect(urls).toEqual([`${ORIGIN}${replayAddress(id)}`]);
      expect(container.querySelectorAll("button[data-grave-index]")).toHaveLength(1);
      cleanup();
    }
  });

  it("wins over ?scan= and shows the error panel with no request for any other value", async () => {
    const wins = mount("?scan=%2Fdemo%2Fscan.json&replay=keyv");
    await ready();
    expect(wins.urls).toEqual([`${ORIGIN}/replay/keyv.json`]);
    cleanup();
    for (const bad of ["other", "", "AXIOS", "axios%2F..", "..%2Fdemo%2Fscan", "https%3A%2F%2Fevil.example%2Fx.json"]) {
      const { urls } = mount(`?replay=${bad}`);
      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toContain("scan-url-rejected");
      });
      expect(urls).toEqual([]);
      cleanup();
    }
    const repeated = mount("?replay=axios&replay=keyv");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("scan-url-rejected");
    });
    expect(repeated.urls).toEqual([]);
  });

  it("shows no demo label, no evidence downloads and no pull request button on a replay", async () => {
    const { container } = mount("?replay=axios");
    await ready();
    expect(container.textContent).not.toContain("demo fixture, recorded data");
    expect(container.querySelector(".evidence-link")).toBeNull();
    expect(container.querySelector(".header-evidence")).toBeNull();
    fireEvent.click(grave(container));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Open pull request" })).toBeNull();
    expect(dialog.textContent).not.toContain("Open pull request");
  });
});

describe("the banner (requirement 19)", () => {
  it("shows the title, the exact text and one link per source on the scene screen and inside the drawer", async () => {
    for (const id of REPLAY_IDS) {
      const replay = (readReplay(id) as ScanResponse).replay as ReplayInfo;
      const { container } = mount(`?replay=${id}`);
      await ready();
      const notes = container.querySelectorAll('[role="note"]');
      expect(notes).toHaveLength(1);
      expect(container.querySelector("header")?.contains(notes[0] ?? null)).toBe(true);
      expect(notes[0]?.textContent).toContain(REPLAY_BANNER_TEXT);
      expect(notes[0]?.textContent).toContain(replay.title);
      const links = [...(notes[0]?.querySelectorAll("a") ?? [])];
      expect(links.map((a) => a.getAttribute("href"))).toEqual(replay.sources.map((s) => s.url));
      for (const a of links) {
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      }
      fireEvent.click(grave(container));
      const dialog = screen.getByRole("dialog");
      const inDrawer = dialog.querySelectorAll('[role="note"]');
      expect(inDrawer).toHaveLength(1);
      expect(inDrawer[0]?.textContent).toContain(REPLAY_BANNER_TEXT);
      cleanup();
    }
  });

  it("shows no banner on the demo", async () => {
    const urlOf = (): typeof fetch =>
      ((): Promise<Response> => Promise.resolve(new Response(JSON.stringify({ ...(readReplay("axios") as ScanResponse), replay: undefined }), { status: 200 }))) as typeof fetch;
    render(<App fetchFn={urlOf()} apiBase={null} initialSearch="" pageOrigin={ORIGIN} />);
    await ready();
    expect(document.querySelector('[role="note"]')).toBeNull();
  });
});

describe("the replay through the scrubber (requirement 20)", () => {
  it("places the Stops at the sourced instants, one Step mark at every Stop after the first", async () => {
    for (const id of REPLAY_IDS) {
      const stops = stopsFor(readReplay(id) as ScanResponse);
      expect(stops.stops.map((ms) => new Date(ms).toISOString())).toEqual(EXPECTED_SEGMENTS[id].map((s) => s.from));
      const { container } = mount(`?replay=${id}`);
      await ready();
      expect(Number(slider().max) + 1).toBe(EXPECTED_SEGMENTS[id].length);
      expect(container.querySelectorAll(".scrub-ticks path")).toHaveLength(1);
      cleanup();
    }
  });

  it("shows the version, state and reason of each Stop in the grave name, tooltip and drawer", async () => {
    for (const id of REPLAY_IDS) {
      const { container } = mount(`?replay=${id}`);
      await ready();
      for (const [i, expected] of EXPECTED_SEGMENTS[id].entries()) {
        move(i);
        expect(slider().getAttribute("aria-valuetext")).toBe(STOP_TEXT[id][i]);
        expect(label(container)).toBe(`${id} ${expected.version}, ${expected.state}`);
        expect(label(container)).not.toContain("not yet published");
        fireEvent.pointerEnter(grave(container));
        const tip = screen.getByRole("tooltip").textContent ?? "";
        expect(tip).toContain(`${expected.version}, ${expected.state}`);
        expect(tip).toContain(expected.reason);
        fireEvent.pointerLeave(grave(container));
      }
      for (const [i, expected] of EXPECTED_SEGMENTS[id].entries()) {
        move(i);
        fireEvent.click(grave(container));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe(`${id} ${expected.version}`);
        expect(dialog.querySelector(".drawer-asof")?.textContent).toBe(`State on ${STOP_TEXT[id][i]}: ${expected.state}. ${expected.reason}`);
        fireEvent.keyDown(dialog, { key: "Escape" });
      }
      cleanup();
    }
  });

  it("names the provenance regression at axios 1.14.1 and the new install script at keyv 6.0.0 in the tooltip", async () => {
    const axios = mount("?replay=axios");
    await ready();
    move(1);
    fireEvent.pointerEnter(grave(axios.container));
    expect(screen.getByRole("tooltip").textContent).toContain("provenance regression");
    cleanup();
    const keyv = mount("?replay=keyv");
    await ready();
    move(1);
    fireEvent.pointerEnter(grave(keyv.container));
    expect(screen.getByRole("tooltip").textContent).toContain("install script added in 6.0.0");
  });

  it("opens each replay at its first Stop with the first row of its table (spec cemetery-time-fixes, 3.1)", async () => {
    for (const id of REPLAY_IDS) {
      const { container } = mount(`?replay=${id}`);
      await ready();
      const first = EXPECTED_SEGMENTS[id][0];
      expect(slider().value).toBe("0");
      expect(slider().getAttribute("aria-valuetext")).toBe(STOP_TEXT[id][0]);
      expect(label(container)).toBe(`${id} ${first.version}, ${first.state}`);
      expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
      cleanup();
    }
  });

  it("returns to 1.14.0 at the end of the axios replay", async () => {
    const { container } = mount("?replay=axios");
    await ready();
    move(2);
    expect(slider().value).toBe("2");
    expect(label(container)).toBe("axios 1.14.0, Alive");
  });
});

let parser: DOMParser | null = null;
/** Parses both screens in one document, each in its own wrapper, so a run costs one parse. */
function screensOf(scene: string, drawer: string): readonly Element[] {
  parser ??= new DOMParser();
  const doc = parser.parseFromString(`<!doctype html><body><div id="s">${scene}</div><div id="d">${drawer}</div>`, "text/html");
  return [doc.getElementById("s"), doc.getElementById("d")].filter((e): e is HTMLElement => e !== null);
}

const HOSTILE = [
  "javascript:alert(1)",
  "http://x.example/a",
  "HTTPS://x.example/a",
  "https://x.example/a b",
  "https://x.example/a\nb",
  "https://x.example/\u0000",
  "https://x.example/\t",
  " https://x.example/a",
  "data:text/html,<script>alert(1)</script>",
  "//x.example/a",
  "https://x.example/ok",
  "https://",
];

const arbReplayBlock: fc.Arbitrary<ReplayInfo> = fc.record({
  id: fc.constantFrom<ReplayId>("axios", "keyv"),
  title: fc.oneof(fc.string({ maxLength: 40 }), fc.constant("<script>alert(1)</script>")),
  summary: fc.oneof(fc.string({ maxLength: 80 }), fc.constant('<img src="x" onerror="alert(1)">')),
  sources: fc.array(
    fc.record({
      label: fc.oneof(fc.string({ maxLength: 30 }), fc.constant("<svg onload=x>")),
      url: fc.oneof(fc.constantFrom(...HOSTILE), fc.string({ maxLength: 40 }), fc.constantFrom(...EIGHT_URLS)),
    }),
    { minLength: 1, maxLength: 6 },
  ),
});

// eslint-disable-next-line no-control-regex -- the link rule rejects control characters
const safe = (url: string): boolean => url.startsWith("https://") && !/[\s\u0000-\u001f\u007f]/.test(url);

describe("Property 21: The banner is on every replay screen and links only to https", () => {
  it("Feature: cemetery-time, Property 21: The banner is on every replay screen and links only to https", () => {
    const base = readReplay("axios") as ScanResponse;
    const pkg = base.report.packages[0] as PackageHealth;
    const model = drawerModel(base, pkg);
    const noop = (): void => undefined;
    fc.assert(
      fc.property(arbReplayBlock, (replay) => {
        const screens = screensOf(
          renderToStaticMarkup(<Header model={null} theme="dark" apiConfigured={false} onSubmit={() => null} replay={replay} />),
          renderToStaticMarkup(<Drawer model={model} replay={replay} onClose={noop} />),
        );
        expect(screens).toHaveLength(2);
        for (const doc of screens) {
          const notes = doc.querySelectorAll('[role="note"]');
          expect(notes).toHaveLength(1);
          const note = notes[0] as Element;
          expect(note.textContent).toContain(REPLAY_BANNER_TEXT);
          const anchors = [...note.querySelectorAll("a")];
          expect(anchors).toHaveLength(replay.sources.filter((s) => safe(s.url)).length);
          for (const a of anchors) {
            expect(a.getAttribute("target")).toBe("_blank");
            expect(a.getAttribute("rel")).toBe("noopener noreferrer");
            const href = a.getAttribute("href") ?? "";
            expect(href.startsWith("https://")).toBe(true);
            expect(/\s/.test(href)).toBe(false);
          }
          expect(note.querySelectorAll("script, img, iframe, svg, style")).toHaveLength(0);
          for (const el of note.querySelectorAll("[href], [src]")) expect(el.tagName).toBe("A");
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Property 22: The replay query is a closed set", () => {
  it("Feature: cemetery-time, Property 22: The replay query is a closed set", () => {
    const arbValue = fc.oneof(
      fc.constantFrom("axios", "keyv", "AXIOS", "Keyv", "axios ", " keyv", "axios/", "../axios", "..", "/replay/axios.json", "https://evil.example/x.json", "", "axios\u0000"),
      fc.string({ maxLength: 20 }),
    );
    fc.assert(
      fc.property(arbValue, fc.string({ maxLength: 8 }).filter((s) => !/[&=#]/.test(s)), fc.boolean(), (value, noise, twice) => {
        const search = `?x=${encodeURIComponent(noise)}&replay=${encodeURIComponent(value)}${twice ? "&replay=axios" : ""}`;
        const parsed = parseReplayParam(search);
        const wantId = !twice && (value === "axios" || value === "keyv");
        if (wantId) expect(parsed).toEqual({ id: value });
        else expect(parsed).toEqual({ rejected: true });
      }),
      { numRuns: 100 },
    );
    expect(parseReplayParam("")).toBeNull();
    expect(parseReplayParam("?scan=%2Fdemo%2Fscan.json")).toBeNull();
    for (const id of REPLAY_IDS) {
      for (const [origin, api] of [
        ["http://localhost", null],
        ["https://sexton.example", "/api"],
        ["https://sexton.example:8443", "https://api.example"],
      ] as const) {
        const check = checkScanUrl(replayAddress(id), origin, api);
        expect(check.ok).toBe(true);
        if (check.ok) expect(new URL(check.url).origin).toBe(new URL(origin).origin);
      }
    }
  });
});
