import type { ReplayInfo, ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { checkScanUrl } from "../src/load/check-scan-url.js";
import { WhyCard } from "../src/replay/ReplayView.js";
import { REPLAY_NOT_LIVE } from "../src/replay/replay-story.js";
import { REPLAY_IDS, parseReplayParam, replayAddress, type ReplayId } from "../src/replay/replay-ids.js";
import { stopsFor } from "../src/time/stops.js";
import { readDemoScanText } from "./support/demo-scan.js";
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
    // Spec clean-site, task 3: the attack picker sits in the Footer bar of a loaded scan, so the demo is served too.
    if (id === undefined && url === `${ORIGIN}/demo/scan.json`) return Promise.resolve(new Response(readDemoScanText(), { status: 200 }));
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
// Spec clean-site, task 6.3: a Replay moves by its Step cards in the Footer bar; it has no scrubber.
const stepCards = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>("footer .step-card")];
const move = (value: number): void => {
  fireEvent.click(stepCards()[value] as HTMLButtonElement);
};
const stepTime = (): string => document.querySelector(".step-panel .eyebrow-time")?.textContent ?? "";
const grave = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>("button[data-grave-index]") as HTMLElement;
const label = (container: HTMLElement): string => grave(container).getAttribute("aria-label") ?? "";

const STOP_TEXT = {
  axios: ["30 Mar 2026, 23:21 UTC", "31 Mar 2026, 00:21 UTC", "31 Mar 2026, 03:29 UTC"],
  keyv: ["4 Aug 2026, 08:35 UTC", "4 Aug 2026, 09:35 UTC"],
} as const;

describe("opening a replay (requirement 18)", () => {
  // Spec clean-site, 16.7 and 16.16: "Watch a real attack" in the Footer bar opens the attack picker in place of the
  // Replay group.
  it("opens the attack picker from the Footer bar with its heading, its line and one button per Replay, and closes it again", async () => {
    mount("");
    await ready();
    const watch = screen.getByRole("button", { name: "Watch a real attack" });
    expect(watch.closest("footer.foot-bar")).not.toBeNull();
    expect(watch.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(watch);
    const pop = document.getElementById("attack-pop") as HTMLElement;
    expect(pop.querySelector(".pop-heading")?.textContent).toBe("Two real npm attacks from 2026");
    expect(pop.querySelector(".pop-line")?.textContent).toBe(
      "A trusted package was taken over and a bad version was published. See how each one would have looked in your cemetery.",
    );
    expect([...pop.querySelectorAll("button.attack")].map((b) => b.textContent)).toEqual(["axios31 March 2026. 3 steps.", "keyv4 August 2026. 2 steps."]);
    fireEvent.click(watch);
    expect(document.getElementById("attack-pop")).toBeNull();
  });

  // Spec clean-site, task 6.3: the Replay's Footer bar has no attack picker (the prototype's), so the second Replay
  // is picked after Exit replay.
  it("loads each fixture from the page origin when its picker button is pressed, the second one after Exit replay", async () => {
    const { urls, container } = mount("");
    await ready();
    const pick = (name: RegExp): void => {
      fireEvent.click(screen.getByRole("button", { name: "Watch a real attack" }));
      fireEvent.click(screen.getByRole("button", { name }));
    };
    pick(/^axios/);
    await waitFor(() => {
      expect(label(container)).toBe("axios 1.14.0, Alive");
    });
    expect(urls).toEqual([`${ORIGIN}/demo/scan.json`, `${ORIGIN}/replay/axios.json`]);
    expect(container.querySelector("header .scan-tag")?.textContent).toBe("Replay");
    fireEvent.click(screen.getByRole("button", { name: "Exit replay" }));
    await waitFor(() => {
      expect(container.querySelectorAll("button[data-grave-index]").length).toBeGreaterThan(1);
    });
    pick(/^keyv/);
    await waitFor(() => {
      expect(label(container)).toBe("keyv 5.6.0, Alive");
    });
    expect(urls.slice(2)).toEqual([`${ORIGIN}/demo/scan.json`, `${ORIGIN}/replay/keyv.json`]);
    // The Replay opens at Step 1.
    expect(stepTime()).toBe(STOP_TEXT.keyv[0]);
    // The wordmark takes the Home action and loads the Sample scan again.
    fireEvent.click(screen.getByRole("link", { name: "Sexton, back to the cemetery" }), { button: 0 });
    await waitFor(() => {
      expect(container.querySelectorAll("button[data-grave-index]").length).toBeGreaterThan(1);
    });
    expect(urls[4]).toBe(`${ORIGIN}/demo/scan.json`);
    expect(container.querySelector("header .scan-tag")?.textContent).toBe("Sample scan");
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

  it("wins over ?scan= and shows the load failure card (12.7) with no request for any other value", async () => {
    const wins = mount("?scan=%2Fdemo%2Fscan.json&replay=keyv");
    await ready();
    expect(wins.urls).toEqual([`${ORIGIN}/replay/keyv.json`]);
    cleanup();
    for (const bad of ["other", "", "AXIOS", "axios%2F..", "..%2Fdemo%2Fscan", "https%3A%2F%2Fevil.example%2Fx.json"]) {
      const { urls } = mount(`?replay=${bad}`);
      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toBe("!This scan could not be loaded.Try again, or open the sample.Try againBack to the sample");
      });
      expect(urls).toEqual([]);
      cleanup();
    }
    const repeated = mount("?replay=axios&replay=keyv");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("!This scan could not be loaded.Try again, or open the sample.Try againBack to the sample");
    });
    expect(repeated.urls).toEqual([]);
  });

  // Spec clean-site, 8.19: the grave opens nothing, so no Drawer (and no pull request button) can show on a Replay.
  it("shows no demo label, no evidence downloads and no pull request button on a replay, and its grave opens nothing", async () => {
    const { container } = mount("?replay=axios");
    await ready();
    expect(container.querySelector("header .scan-tag")?.textContent).toBe("Replay");
    expect(container.querySelector(".evidence-link")).toBeNull();
    fireEvent.click(grave(container));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.textContent).not.toContain("Open pull request");
  });
});

// Spec clean-site, task 6.3: the banner became the Why card in the Panel (8.12), with the not-live line said once.
describe("the Why card (requirement 19, spec clean-site 8.12)", () => {
  it("shows the not-live line once and one link per https source in the Panel, and nothing in the header", async () => {
    for (const id of REPLAY_IDS) {
      const replay = (readReplay(id) as ScanResponse).replay as ReplayInfo;
      const { container } = mount(`?replay=${id}`);
      await ready();
      const card = container.querySelector("main aside .why-card") as HTMLElement;
      expect(container.querySelector("header")?.textContent).not.toContain(REPLAY_NOT_LIVE);
      expect(card.textContent).toContain(REPLAY_NOT_LIVE);
      expect(container.textContent?.split(REPLAY_NOT_LIVE)).toHaveLength(2);
      const links = [...card.querySelectorAll("a")];
      expect(links.map((a) => a.getAttribute("href"))).toEqual(replay.sources.map((s) => s.url));
      for (const a of links) {
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      }
      cleanup();
    }
  });

  it("shows no Why card and no not-live line on a scan that is not a replay", async () => {
    const urlOf = (): typeof fetch =>
      ((): Promise<Response> => Promise.resolve(new Response(JSON.stringify({ ...(readReplay("axios") as ScanResponse), replay: undefined }), { status: 200 }))) as typeof fetch;
    render(<App fetchFn={urlOf()} apiBase={null} initialSearch="" pageOrigin={ORIGIN} />);
    await ready();
    expect(document.querySelector(".why-card")).toBeNull();
    expect(document.body.textContent).not.toContain(REPLAY_NOT_LIVE);
  });
});

// Spec clean-site, task 6.3: the Stops are the Replay's Steps, reached by the Step cards.
describe("the replay through its Steps (requirement 20)", () => {
  it("places the Stops at the sourced instants, one Step card per Stop", async () => {
    for (const id of REPLAY_IDS) {
      const stops = stopsFor(readReplay(id) as ScanResponse);
      expect(stops.stops.map((ms) => new Date(ms).toISOString())).toEqual(EXPECTED_SEGMENTS[id].map((s) => s.from));
      mount(`?replay=${id}`);
      await ready();
      expect(stepCards()).toHaveLength(EXPECTED_SEGMENTS[id].length);
      expect(screen.queryByRole("slider")).toBeNull();
      cleanup();
    }
  });

  // Spec clean-site, task 2.1: the tooltip half went with the tooltip (4.1). Task 6.3: the drawer half became the
  // Step badge, since the grave opens nothing on a Replay (8.19).
  it("shows the version and state of each Stop in the grave name and the Step badge", async () => {
    for (const id of REPLAY_IDS) {
      const { container } = mount(`?replay=${id}`);
      await ready();
      for (const [i, expected] of EXPECTED_SEGMENTS[id].entries()) {
        move(i);
        expect(stepTime()).toBe(STOP_TEXT[id][i]);
        expect(label(container)).toBe(`${id} ${expected.version}, ${expected.state}`);
        expect(label(container)).not.toContain("not yet published");
        expect(container.querySelector(".step-panel .badge")?.textContent).toBe(`${id} ${expected.version} is ${expected.state}`);
      }
      cleanup();
    }
  });

  // Task 6.3: read from "What Sexton shows" now that the Replay has no Drawer.
  it("names the provenance drop at axios 1.14.1 and the new install script at keyv 6.0.0 in What Sexton shows", async () => {
    const shows = (): string => [...document.querySelectorAll(".step-panel .step-text")][1]?.textContent ?? "";
    mount("?replay=axios");
    await ready();
    move(1);
    expect(shows()).toContain("1.14.1 has none");
    cleanup();
    mount("?replay=keyv");
    await ready();
    move(1);
    expect(shows()).toContain("An install script appeared");
  });

  it("opens each replay at its first Stop with the first row of its table (spec cemetery-time-fixes, 3.1)", async () => {
    for (const id of REPLAY_IDS) {
      const { container } = mount(`?replay=${id}`);
      await ready();
      const first = EXPECTED_SEGMENTS[id][0];
      expect(stepCards()[0]?.getAttribute("aria-current")).toBe("step");
      expect(stepTime()).toBe(STOP_TEXT[id][0]);
      expect(label(container)).toBe(`${id} ${first.version}, ${first.state}`);
      expect(screen.getByRole("button", { name: "Play all" })).toBeTruthy();
      cleanup();
    }
  });

  // Spec clean-site, 8.1: the Replay's headline and sub-line in place of the Home headline; no policy line.
  it("shows the replay headline and sub-line and no policy line, at every Stop", async () => {
    for (const id of REPLAY_IDS) {
      const { container } = mount(`?replay=${id}`);
      await ready();
      for (let i = 0; i < EXPECTED_SEGMENTS[id].length; i += 1) {
        move(i);
        expect(container.querySelector(".headline")?.textContent).toBe(`Watch the ${id} attack unfold`);
        expect(container.querySelector(".hero-line")?.textContent).toMatch(/^\d{1,2} [A-Z][a-z]+ 2026\. A real attack on one package, step by step\. Watch the grave change\.$/);
        expect(container.querySelector(".footer-policy")).toBeNull();
        expect(container.textContent).not.toContain("policy:");
        expect(container.textContent).not.toContain("no scan metadata in this response");
      }
      cleanup();
    }
  });

  it("returns to 1.14.0 at the end of the axios replay", async () => {
    const { container } = mount("?replay=axios");
    await ready();
    move(2);
    expect(stepTime()).toBe(STOP_TEXT.axios[2]);
    expect(label(container)).toBe("axios 1.14.0, Alive");
  });
});

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
  steps: fc.constant([]),
  why: fc.oneof(fc.string({ maxLength: 80 }), fc.constant("<script>alert(1)</script>")),
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

// Spec clean-site, task 6.3: the banner is the Why card, the one place a Replay shows its sources and the not-live
// line; the Drawer no longer carries a replay (8.19), so the property runs on the card alone.
describe("Property 21: The banner is on every replay screen and links only to https", () => {
  it("Feature: cemetery-time, Property 21: The banner is on every replay screen and links only to https", () => {
    parser ??= new DOMParser();
    fc.assert(
      fc.property(arbReplayBlock, (replay) => {
        const doc = (parser as DOMParser).parseFromString(`<!doctype html><body>${renderToStaticMarkup(<WhyCard replay={replay} />)}</body>`, "text/html");
        const card = doc.querySelector(".why-card") as Element;
        expect(card.textContent).toContain(REPLAY_NOT_LIVE);
        const anchors = [...card.querySelectorAll("a")];
        expect(anchors).toHaveLength(replay.sources.filter((s) => safe(s.url)).length);
        for (const a of anchors) {
          expect(a.getAttribute("target")).toBe("_blank");
          expect(a.getAttribute("rel")).toBe("noopener noreferrer");
          const href = a.getAttribute("href") ?? "";
          expect(href.startsWith("https://")).toBe(true);
          expect(/\s/.test(href)).toBe(false);
        }
        expect(card.querySelectorAll("script, img, iframe, svg, style")).toHaveLength(0);
        for (const el of card.querySelectorAll("[href], [src]")) expect(el.tagName).toBe("A");
      }),
      { numRuns: 1000 },
    );
  });
});

let parser: DOMParser | null = null;

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
