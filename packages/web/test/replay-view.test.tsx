// Spec clean-site, task 6.3: the Replay as a story (requirement 8, with 11.2 and 17). The Play cases moved here from
// scrubber.test.tsx: Play is now the Replay's "Play all" in its own Footer bar.
import type { ReplayInfo, ScanResponse } from "@sexton/api";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { REPLAY_IDS, replayAddress, type ReplayId } from "../src/replay/replay-ids.js";
import { ReplayView } from "../src/replay/ReplayView.js";
import { REPLAY_NOT_LIVE, storySteps } from "../src/replay/replay-story.js";
import { PLAY_STEP_MS } from "../src/time/play.js";
import { cheapScan } from "./arbitraries.js";
import { setMedia } from "./setup.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { EXPECTED_SEGMENTS, readReplay, readReplayText } from "./support/replay-fixture.js";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});

const ORIGIN = "http://localhost";
const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: { "color-contrast": { enabled: false } },
};

function mount(search: string, urls: string[] = []) {
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    const id = REPLAY_IDS.find((r) => url === `${ORIGIN}${replayAddress(r)}`);
    if (id !== undefined) return Promise.resolve(new Response(readReplayText(id), { status: 200 }));
    return Promise.resolve(new Response(readDemoScanText(), { status: 200 }));
  }) as typeof fetch;
  return render(<App fetchFn={fetchFn} apiBase={null} initialSearch={search} pageOrigin={ORIGIN} />);
}
async function ready(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(".step-panel")).not.toBeNull();
  });
}
const replayOf = (id: ReplayId): ReplayInfo => (readReplay(id) as ScanResponse).replay as ReplayInfo;
const panel = (): HTMLElement => document.querySelector(".step-panel") as HTMLElement;
const footer = (): HTMLElement => document.querySelector("footer.replay-foot") as HTMLElement;
const cards = (): HTMLButtonElement[] => [...footer().querySelectorAll<HTMLButtonElement>(".step-card")];
const current = (): number => cards().findIndex((c) => c.getAttribute("aria-current") === "step");
const playButton = (): HTMLButtonElement => within(footer()).getAllByRole("button")[0] as HTMLButtonElement;
const live = (): string => footer().querySelector('[aria-live="polite"]')?.textContent ?? "";
const grave = (): HTMLElement => document.querySelector<HTMLElement>("button[data-grave-index]") as HTMLElement;
const tick = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

const STEP_TIME = {
  axios: ["30 Mar 2026, 23:21 UTC", "31 Mar 2026, 00:21 UTC", "31 Mar 2026, 03:29 UTC"],
  keyv: ["4 Aug 2026, 08:35 UTC", "4 Aug 2026, 09:35 UTC"],
} as const;

describe("the Replay view (8.1 to 8.8, 8.12, 8.16, 8.19 to 8.22)", () => {
  it("takes the screen in place of Home with the breadcrumb, headline and sub-line, and opens at Step 1", async () => {
    for (const id of REPLAY_IDS) {
      const { container } = mount(`?replay=${id}`);
      await ready();
      const crumbs = container.querySelector('nav[aria-label="Breadcrumb"]') as HTMLElement;
      expect(crumbs.textContent).toBe(`← Cemetery/Real attacks/${id}`);
      expect(container.querySelector("h1")?.textContent).toBe(`Watch the ${id} attack unfold`);
      const date = id === "axios" ? "31 March 2026" : "4 August 2026";
      expect(container.querySelector(".hero-line")?.textContent).toBe(`${date}. A real attack on one package, step by step. Watch the grave change.`);
      // Home's parts are not on screen: no chips, no Graveyard / List switch, no Inspector, no Fix order, no scrubber.
      expect(container.querySelector(".chips")).toBeNull();
      expect(container.querySelector(".view-switch")).toBeNull();
      expect(container.querySelector(".inspector")).toBeNull();
      expect(container.querySelector(".fix-order")).toBeNull();
      expect(screen.queryByRole("slider")).toBeNull();
      expect(screen.queryByRole("button", { name: "Watch a real attack" })).toBeNull();
      expect(panel().querySelector("h2")?.textContent).toBe(`Step 1 of ${String(EXPECTED_SEGMENTS[id].length)}${STEP_TIME[id][0]}`);
      expect(container.querySelector(".scan-tag")?.textContent).toBe("Replay");
      cleanup();
    }
  });

  it("shows each Step's time, title, badge, what happened and what Sexton shows, different at every Step", async () => {
    for (const id of REPLAY_IDS) {
      const { container } = mount(`?replay=${id}`);
      await ready();
      const steps = replayOf(id).steps;
      const seen: string[] = [];
      for (const [i, expected] of EXPECTED_SEGMENTS[id].entries()) {
        fireEvent.click(cards()[i] as HTMLButtonElement);
        const step = steps[i];
        expect(panel().querySelector(".eyebrow-time")?.textContent).toBe(STEP_TIME[id][i]);
        expect(panel().querySelector(".step-title")?.textContent).toBe(step?.title);
        expect(panel().querySelector(".badge")?.textContent).toBe(`${id} ${expected.version} is ${expected.state}`);
        const texts = [...panel().querySelectorAll(".step-text")].map((p) => p.textContent);
        expect(texts).toEqual([step?.happened, step?.shows]);
        expect([...panel().querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["What happened", "What Sexton shows"]);
        // The stage: one grave at the Step's version and State, and the date badge of the Step time (8.16).
        expect(container.querySelectorAll("button[data-grave-index]")).toHaveLength(1);
        expect(grave().getAttribute("aria-label")).toBe(`${id} ${expected.version}, ${expected.state}`);
        expect(container.querySelector(".scene-card .date-badge")?.textContent).toBe(STEP_TIME[id][i]);
        seen.push(panel().textContent ?? "");
      }
      expect(new Set(seen).size).toBe(seen.length);
      cleanup();
    }
  });

  it("moves with Next step and Back, disables Back at Step 1, and turns Next step into Back to the cemetery at the last", async () => {
    const urls: string[] = [];
    const { container } = mount("?replay=axios", urls);
    await ready();
    const back = (): HTMLButtonElement => within(panel()).getByRole("button", { name: "Back" }) as HTMLButtonElement;
    expect(back().disabled).toBe(true);
    fireEvent.click(within(panel()).getByRole("button", { name: "Next step" }));
    expect(current()).toBe(1);
    expect(back().disabled).toBe(false);
    fireEvent.click(back());
    expect(current()).toBe(0);
    fireEvent.click(within(panel()).getByRole("button", { name: "Next step" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Next step" }));
    expect(current()).toBe(2);
    expect(within(panel()).queryByRole("button", { name: "Next step" })).toBeNull();
    fireEvent.click(within(panel()).getByRole("button", { name: "Back to the cemetery" }));
    await waitFor(() => {
      expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
    });
    expect(urls).toEqual([`${ORIGIN}/replay/axios.json`, `${ORIGIN}/demo/scan.json`]);
  });

  it("shows one card per Step with its number and title, marks the shown one, and shows its Step when pressed (8.8, 8.22)", async () => {
    mount("?replay=axios");
    await ready();
    expect(cards().map((c) => c.textContent)).toEqual(replayOf("axios").steps.map((s, i) => `Step ${String(i + 1)}${s.title}`));
    expect(cards().map((c) => c.getAttribute("aria-current"))).toEqual(["step", null, null]);
    fireEvent.click(cards()[2] as HTMLButtonElement);
    expect(cards().map((c) => c.getAttribute("aria-current"))).toEqual([null, null, "step"]);
    expect(panel().querySelector("h2")?.textContent).toBe(`Step 3 of 3${STEP_TIME.axios[2]}`);
    const names = within(footer()).getAllByRole("button").map((b) => b.textContent);
    expect(names[0]).toBe("Play all");
    expect(names[names.length - 1]).toBe("Exit replay");
  });

  it("takes the Home action on Exit replay and on the breadcrumb (8.18, 10.1)", async () => {
    for (const leave of ["Exit replay", "← Cemetery"]) {
      const urls: string[] = [];
      const { container } = mount("?replay=keyv", urls);
      await ready();
      fireEvent.click(screen.getByRole("button", { name: leave }));
      await waitFor(() => {
        expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
      });
      expect(urls).toEqual([`${ORIGIN}/replay/keyv.json`, `${ORIGIN}/demo/scan.json`]);
      expect(container.querySelector(".step-panel")).toBeNull();
      cleanup();
    }
  });

  it("opens nothing when the grave is pressed (8.19), so no Drawer sits on the Replay", async () => {
    for (const id of REPLAY_IDS) {
      mount(`?replay=${id}`);
      await ready();
      fireEvent.click(grave());
      fireEvent.keyDown(grave(), { key: "Enter" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.querySelector(".drawer")).toBeNull();
      cleanup();
    }
  });

  it("shows the Why card with the why text, a link only for each https source, and the not-live line once (8.12)", async () => {
    for (const id of REPLAY_IDS) {
      const replay = replayOf(id);
      const { container } = mount(`?replay=${id}`);
      await ready();
      const card = container.querySelector(".why-card") as HTMLElement;
      expect(card.querySelector("h2")?.textContent).toBe("Why attackers do this");
      expect(card.querySelector(".why-text")?.textContent).toBe(replay.why);
      const links = [...card.querySelectorAll("a")];
      expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(replay.sources.map((s) => [s.label, s.url]));
      for (const a of links) {
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      }
      expect(container.textContent?.split(REPLAY_NOT_LIVE).length).toBe(2);
      expect(card.textContent).toContain(REPLAY_NOT_LIVE);
      expect(document.querySelector('[role="note"]')).toBeNull();
      cleanup();
    }
  });

  it("marks Terms in the Step and why texts as buttons that open their meaning (11.2)", async () => {
    mount("?replay=axios");
    await ready();
    const terms = [...document.querySelectorAll<HTMLButtonElement>(".step-panel .term, .why-card .term")].map((b) => b.textContent?.toLowerCase());
    expect(terms).toContain("provenance");
    const term = document.querySelector<HTMLButtonElement>(".step-panel .term") as HTMLButtonElement;
    fireEvent.click(term);
    expect(document.querySelector('[data-popover="term"]')).not.toBeNull();
    // Escape closes the meaning first and keeps the Replay (10.3).
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector('[data-popover="term"]')).toBeNull();
    expect(document.querySelector(".step-panel")).not.toBeNull();
  });

  it("shows the waiting card under the Replay's heading while its file loads, and the error card when it fails", async () => {
    const never = (() => new Promise<Response>(() => undefined)) as typeof fetch;
    const { container } = render(<App fetchFn={never} apiBase={null} initialSearch="?replay=axios" pageOrigin={ORIGIN} />);
    expect(container.querySelector("h1")?.textContent).toBe("Watch the axios attack unfold");
    expect(screen.getByRole("status")).toBeTruthy();
    cleanup();
    const broken = (() => Promise.resolve(new Response(JSON.stringify({ nope: true }), { status: 200 }))) as typeof fetch;
    render(<App fetchFn={broken} apiBase={null} initialSearch="?replay=keyv" pageOrigin={ORIGIN} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(document.querySelector(".step-panel")).toBeNull();
    cleanup();
    // A file whose Steps do not match its Stops is refused by the validator (8.15).
    const plain = readReplay("axios") as ScanResponse;
    const { timelines: _t, ...noTimelines } = plain;
    expect(_t).toBeDefined();
    const storyless = (() => Promise.resolve(new Response(JSON.stringify(noTimelines), { status: 200 }))) as typeof fetch;
    render(<App fetchFn={storyless} apiBase={null} initialSearch="?replay=axios" pageOrigin={ORIGIN} />);
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("This one would not come out of the ground.!This scan could not be loaded.Try again, or open the sample.Try againBack to the sample");
    });
    cleanup();
    // Should such a response reach the view anyway, it shows the load failure card, never a card that waits for ever.
    const ref = { current: null };
    render(
      <ReplayView
        id="axios"
        load={{ status: "ready", loadId: 1, response: noTimelines as ScanResponse, isDemo: false, source: "replay" }}
        theme="dark"
        reducedMotion={false}
        repoFieldRef={ref}
        onHome={() => undefined}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("This one would not come out of the ground.!This scan could not be loaded.Try again, or open the sample.Try againBack to the sample");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("gives the story of each fixture, and none for a scan that is not a replay", () => {
    for (const id of REPLAY_IDS) {
      const steps = storySteps(readReplay(id) as ScanResponse);
      expect(steps?.map((s) => [new Date(s.ms).toISOString(), s.version, s.state])).toEqual(EXPECTED_SEGMENTS[id].map((s) => [s.from, s.version, s.state]));
    }
    expect(storySteps(cheapScan(1))).toBeNull();
    const short = readReplay("axios") as ScanResponse;
    expect(storySteps({ ...short, replay: { ...(short.replay as ReplayInfo), steps: short.replay?.steps.slice(1) ?? [] } })).toBeNull();
  });

  it("has no axe violations at each Step", async () => {
    for (const id of REPLAY_IDS) {
      mount(`?replay=${id}`);
      await ready();
      for (let i = 0; i < cards().length; i += 1) {
        fireEvent.click(cards()[i] as HTMLButtonElement);
        const result = await axe.run(document, AXE_OPTIONS);
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
      }
      cleanup();
    }
  });
});

describe("Play all (8.3, 8.9 to 8.11)", () => {
  it("never starts by itself", async () => {
    mount("?replay=axios");
    await ready();
    vi.useFakeTimers();
    tick(10 * PLAY_STEP_MS);
    expect(current()).toBe(0);
    expect(playButton().textContent).toBe("Play all");
  });

  it("is a native button named Play all, first in the Footer bar, with a polite live line", async () => {
    mount("?replay=axios");
    await ready();
    const button = screen.getByRole("button", { name: "Play all" });
    expect(button).toBe(playButton());
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("aria-pressed")).toBe(false);
    const line = footer().querySelector('[aria-live="polite"]') as HTMLElement;
    expect(line.tagName).toBe("P");
    expect(line.textContent).toBe("");
  });

  it("starts with Enter and with Space, and its name becomes Pause", async () => {
    const user = userEvent.setup();
    mount("?replay=axios");
    await ready();
    playButton().focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Pause" })).toBe(playButton());
    await user.keyboard("{Enter}");
    expect(playButton().textContent).toBe("Play all");
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pause" })).toBe(playButton());
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Play all" })).toBe(playButton());
  });

  it("moves one Step every 5 seconds, announces each, and stops at the last Step", async () => {
    mount("?replay=axios");
    await ready();
    expect(PLAY_STEP_MS).toBe(5000);
    vi.useFakeTimers();
    fireEvent.click(playButton());
    expect(live()).toBe(`Playing from ${STEP_TIME.axios[0]}`);
    tick(PLAY_STEP_MS - 1);
    expect(current()).toBe(0);
    tick(1);
    expect(current()).toBe(1);
    expect(live()).toBe(STEP_TIME.axios[1]);
    tick(PLAY_STEP_MS);
    expect(current()).toBe(2);
    expect(playButton().textContent).toBe("Play all");
    expect(live()).toBe(`End of history at ${STEP_TIME.axios[2]}`);
    tick(5 * PLAY_STEP_MS);
    expect(current()).toBe(2);
  });

  it("starts again at Step 1 when pressed at the last Step (8.10)", async () => {
    mount("?replay=axios");
    await ready();
    fireEvent.click(cards()[2] as HTMLButtonElement);
    vi.useFakeTimers();
    fireEvent.click(playButton());
    expect(current()).toBe(0);
    expect(playButton().textContent).toBe("Pause");
    tick(PLAY_STEP_MS);
    expect(current()).toBe(1);
  });

  it("stops on Pause, a Step card, Back and Next step, and keeps the Step shown (8.11)", async () => {
    mount("?replay=axios");
    await ready();
    vi.useFakeTimers();
    const presses: readonly (() => void)[] = [
      () => {
        fireEvent.click(playButton());
      },
      () => {
        fireEvent.click(cards()[0] as HTMLButtonElement);
      },
      () => {
        fireEvent.click(within(panel()).getByRole("button", { name: "Back" }));
      },
      () => {
        fireEvent.click(within(panel()).getByRole("button", { name: "Next step" }));
      },
    ];
    for (const press of presses) {
      fireEvent.click(cards()[0] as HTMLButtonElement);
      fireEvent.click(playButton());
      tick(PLAY_STEP_MS);
      expect(current()).toBe(1);
      press();
      const shown = current();
      expect(playButton().textContent).toBe("Play all");
      tick(5 * PLAY_STEP_MS);
      expect(current()).toBe(shown);
    }
  });

  it("stops on Exit replay: the Replay leaves and no Step moves after", async () => {
    const { container } = mount("?replay=axios");
    await ready();
    fireEvent.click(playButton());
    fireEvent.click(screen.getByRole("button", { name: "Exit replay" }));
    expect(container.querySelector(".step-panel")).toBeNull();
    await waitFor(() => {
      expect(container.querySelector("h1")?.textContent).toBe("1 of 12 dependencies needs you now.");
    });
  });

  it("makes the same steps at the same times under Reduced motion", async () => {
    setMedia("(prefers-reduced-motion: reduce)", true);
    try {
      mount("?replay=axios");
      await ready();
      vi.useFakeTimers();
      fireEvent.click(playButton());
      tick(PLAY_STEP_MS - 1);
      expect(current()).toBe(0);
      tick(1);
      expect(current()).toBe(1);
      tick(PLAY_STEP_MS);
      expect(current()).toBe(2);
    } finally {
      setMedia("(prefers-reduced-motion: reduce)", false);
    }
  });

  it("has no axe violations while playing", async () => {
    mount("?replay=axios");
    await ready();
    vi.useFakeTimers();
    fireEvent.click(playButton());
    expect(playButton().textContent).toBe("Pause");
    vi.useRealTimers();
    const result = await axe.run(document, AXE_OPTIONS);
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    fireEvent.click(playButton());
  });
});
