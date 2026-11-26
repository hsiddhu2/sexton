// Spec cemetery-undead-2, requirements 9 and 11: the replay Burst, the Rise clip and the Load moment.
import type { ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { validateScanResponse } from "../src/load/validate-scan-response.js";
import { burstStopFor } from "../src/replay/burst-stop.js";
import { REPLAY_IDS, replayAddress } from "../src/replay/replay-ids.js";
import { ART_BOX } from "../src/scene/art-box.js";
import { BURST_MS, BURST_PARTICLES, burstFrame, FINAL_POSE, particleAt } from "../src/scene/burst.js";
import { planScene } from "../src/scene/layout.js";
import { claimLoadMoment, setLoadMomentPlayedForTests } from "../src/scene/load-moment.js";
import { LOAD_SPREAD_MS, loadDelay, loadMomentMs, RISE_MS, riseAt } from "../src/scene/rise.js";
import { triageOrder } from "../src/triage/triage.js";
import { inside, probeGrave, PROBE_SCALES } from "./art-box.test.js";
import { scenePackage } from "./arbitraries.js";
import { readReplayText } from "./support/replay-fixture.js";
import { setMedia } from "./setup.js";

const NUM_RUNS = 100;

afterEach(cleanup);
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});

const arbElapsed = fc.oneof(fc.double(), fc.integer({ min: -5_000, max: 10_000 }), fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, BURST_MS));

describe("Feature: cemetery-undead-2, Property 8: The Burst and the rise are pure, bounded and end in the still pose", () => {
  it("keeps every Burst field in [0, 1] and ends in the final pose", () => {
    fc.assert(
      fc.property(arbElapsed, (t) => {
        const f = burstFrame(t);
        for (const v of [f.lid, f.particles, f.rise]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        if (t >= BURST_MS) expect(f).toEqual(FINAL_POSE);
        expect(burstFrame(t)).toEqual(f);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("keeps riseAt in [0, 1], non-decreasing, 0 at or before 0 and 1 from its length", () => {
    fc.assert(
      fc.property(arbElapsed, arbElapsed, (a, b) => {
        const r = riseAt(a);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        if (!(a > 0)) expect(r).toBe(0);
        if (a >= RISE_MS) expect(r).toBe(1);
        if (a <= b) expect(riseAt(a)).toBeLessThanOrEqual(riseAt(b));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("ends every Load moment of 1 to 300 graves within 1,000 ms, starting graves in triage order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), (n) => {
        expect(loadDelay(n - 1, n) + RISE_MS).toBeLessThanOrEqual(1_000);
        expect(loadMomentMs(n)).toBeLessThanOrEqual(1_000);
        expect(loadDelay(n - 1, n)).toBeLessThanOrEqual(LOAD_SPREAD_MS);
        for (let i = 1; i < n; i += 1) expect(loadDelay(i, n)).toBeGreaterThanOrEqual(loadDelay(i - 1, n));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("the Burst stays in the Art box (Property 2, Burst phases)", () => {
  it("draws the open grave inside ART_BOX at every sampled Burst time and scale", () => {
    const pkg = scenePackage("b", "Possessed", "none");
    for (const scale of PROBE_SCALES) {
      for (let t = 0; t <= BURST_MS; t += 40) {
        const plan = { ...planScene({ packages: [pkg], width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 }), burst: { index: 0, startMs: 0 } };
        for (const box of probeGrave({ shape: "open", scale, ghostPhase: 0, marker: true, burial: null }, t, plan)) {
          expect(inside(box, ART_BOX), `t ${String(t)} at ${String(scale)}`).toBe(true);
        }
      }
    }
  });

  it("has eight clods and ten shards on fixed paths that stay in the Art box and are gone at the end", () => {
    expect(BURST_PARTICLES).toHaveLength(18);
    expect(BURST_PARTICLES.filter((p) => p.kind === "dirt")).toHaveLength(8);
    // The drawn bounds at every Burst time are checked by the probe above; here, the paths themselves, in shape
    // units (the Art box is x -17.5 to 81.5 and y from -2.5 in the shape frame), with each particle's reach.
    for (const p of BURST_PARTICLES) {
      for (let q = 0; q < 1; q += 0.05) {
        const at = particleAt(p, q);
        const reach = p.kind === "dirt" ? p.size : p.size * Math.SQRT2;
        expect(at.x - reach).toBeGreaterThan(-17.5);
        expect(at.x + reach).toBeLessThan(81.5);
        expect(at.y - reach).toBeGreaterThan(-2.5);
      }
    }
    expect(burstFrame(BURST_MS).particles).toBe(1);
  });
});

function mount(search: string): void {
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const id = REPLAY_IDS.find((r) => url === `http://localhost${replayAddress(r)}`);
    return Promise.resolve(id === undefined ? new Response("not found", { status: 404 }) : new Response(readReplayText(id), { status: 200 }));
  }) as typeof fetch;
  render(<App fetchFn={fetchFn} apiBase={null} initialSearch={search} pageOrigin="http://localhost" />);
}
// Spec clean-site, task 6.3: a Replay moves by its Step cards; it has no scrubber.
const stepCard = (i: number): HTMLButtonElement => document.querySelectorAll<HTMLButtonElement>("footer .step-card")[i] as HTMLButtonElement;
const replay = (id: "axios" | "keyv"): ScanResponse => {
  const r = validateScanResponse(JSON.parse(readReplayText(id)) as unknown);
  if (!r.ok) throw new Error(`${id} does not validate`);
  return r.value;
};

describe("the Burst Stop (requirement 9.4)", () => {
  it("is 31 Mar 2026, 00:21 UTC for axios and the Possessed Stop of keyv, found from the Segments", () => {
    const axios = replay("axios");
    // The header shows Stops to the minute: 31 Mar 2026, 00:21 UTC.
    expect(new Date(burstStopFor(axios, triageOrder(axios.report.packages)) ?? 0).toISOString().slice(0, 16)).toBe("2026-03-31T00:21");
    const keyv = replay("keyv");
    const stop = burstStopFor(keyv, triageOrder(keyv.report.packages));
    expect(stop).not.toBeNull();
    expect(new Date(stop ?? 0).toISOString().slice(0, 16)).toBe("2026-08-04T09:35");
  });

  it("is null for a scan that is not a replay", () => {
    const axios = replay("axios");
    const { replay: _drop, ...plain } = axios;
    void _drop;
    expect(burstStopFor(plain as ScanResponse, triageOrder(axios.report.packages))).toBeNull();
  });

  // Spec clean-site, task 2.2 (4.5): the Burst plays without its caption; the caption and Bubble cases went with them.
  it("shows no caption at the Burst Stop or on any other Stop", async () => {
    mount("?replay=axios");
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    for (const step of [0, 1, 2, 1]) {
      fireEvent.click(stepCard(step));
      expect(document.querySelector(".burst-caption")).toBeNull();
      expect(document.body.textContent).not.toContain("The wind stops");
    }
  });

  it("shows the final pose at once under Reduced motion, with no caption", async () => {
    setMedia("(prefers-reduced-motion: reduce)", true);
    try {
      mount("?replay=axios");
      await waitFor(() => {
        expect(screen.queryByRole("status")).toBeNull();
      });
      fireEvent.click(stepCard(1));
      expect(document.querySelector(".burst-caption")).toBeNull();
    } finally {
      setMedia("(prefers-reduced-motion: reduce)", false);
    }
    const plan = planScene({ packages: [scenePackage("b", "Possessed", "none")], width: 800, theme: "dark", selectedIndex: null, ghostPhase: 0, reducedMotion: true, burst: { index: 0, startMs: 5 } });
    expect(plan.burst).toEqual({ index: 0, startMs: null });
  });

  it("never changes the grave's State, rectangle or accessible name (requirement 9.8)", () => {
    const pkg = scenePackage("b", "Possessed", "none");
    const still = planScene({ packages: [pkg], width: 800, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    const bursting = planScene({ packages: [pkg], width: 800, theme: "dark", selectedIndex: null, ghostPhase: 0, burst: { index: 0, startMs: 1 } });
    expect(bursting.graves).toEqual(still.graves);
  });
});

describe("the Load moment (requirement 11)", () => {
  it("plays once per page load", () => {
    setLoadMomentPlayedForTests(false);
    expect(claimLoadMoment()).toBe(true);
    expect(claimLoadMoment()).toBe(false);
    expect(claimLoadMoment()).toBe(false);
  });

  it("keeps the rectangles, and stores no start under Reduced motion", () => {
    const pkgs = [scenePackage("a", "Dead", "none"), scenePackage("b", "Alive", "some")];
    const still = planScene({ packages: pkgs, width: 900, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    const rising = planScene({ packages: pkgs, width: 900, theme: "dark", selectedIndex: null, ghostPhase: 0, rise: { startMs: 10 } });
    expect(rising.graves).toEqual(still.graves);
    expect(rising.riseStartMs).toBe(10);
    expect(planScene({ packages: pkgs, width: 900, theme: "dark", selectedIndex: null, ghostPhase: 0, rise: { startMs: 10 }, reducedMotion: true }).riseStartMs).toBeNull();
  });

  it("starts on the first scan of the page and not on a second one", async () => {
    setLoadMomentPlayedForTests(false);
    mount("?replay=axios");
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    expect(claimLoadMoment()).toBe(false);
  });
});
