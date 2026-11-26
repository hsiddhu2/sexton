// Spec clean-site, task 10: the Track slot (requirement 14). With TRACK null no audio file ships and no Music button
// renders (the CSP half is in vite-csp.test.ts); with a track the button starts off, one audio element is made on the first
// turn-on, the Characters' Pose clock follows the beat, and the credit shows.
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { Header } from "../src/header/Header.js";
import { headerModel } from "../src/header/header-model.js";
import { SiteFooter } from "../src/home/SiteFooter.js";
import type { Popover } from "../src/load/screen-state.js";
import { beatMs, creditLine, TRACK, type Track } from "../src/music/track.js";
import { useMusic, type MakeAudio } from "../src/music/use-music.js";
import { planScene } from "../src/scene/layout.js";
import { FRAME_MS, poseAt, poseClock, poseStepMs, STILL_POSE } from "../src/scene/motion.js";
import { Scene } from "../src/scene/Scene.js";
import { cheapScan, scenePackage } from "./arbitraries.js";
import { canvasCalls } from "./setup.js";
import { readDemoScanText } from "./support/demo-scan.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../public");
const README = readFileSync(resolve(HERE, "../../../README.md"), "utf8");
const AUDIO = /\.(mp3|ogg|oga|opus|wav|flac|aac|m4a|weba|webm|mid|midi)$/i;

const SAMPLE: Track = { file: "/music/sample.mp3", title: "A Title", artist: "An Artist", licence: "CC BY 4.0", source: "https://example.org/track", bpm: 120 };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("the empty Track slot (14.1, 1.15)", () => {
  it("is empty, and no audio file ships under public", () => {
    expect(TRACK).toBeNull();
    expect(files(PUBLIC).filter((f) => AUDIO.test(f))).toEqual([]);
  });

  it("renders no Music button and makes no audio element on the page", async () => {
    const audio = vi.spyOn(window, "Audio");
    const make = vi.spyOn(document, "createElement");
    const fetchFn = ((): Promise<Response> => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as typeof fetch;
    const { container } = render(<App fetchFn={fetchFn} apiBase={null} initialSearch="" pageOrigin="http://localhost" />);
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Music" })).toBeNull();
    expect(container.querySelector("audio, .footer-credit")).toBeNull();
    expect(audio).not.toHaveBeenCalled();
    expect(make.mock.calls.filter(([tag]) => String(tag).toLowerCase() === "audio")).toEqual([]);
  });

  it("puts the credit in README.md once a track is set (14.6)", () => {
    if (TRACK === null) {
      expect(README).not.toMatch(/^Music: “/m);
      return;
    }
    expect(README).toContain(creditLine(TRACK));
    expect(README).toContain(TRACK.source);
  });
});

describe("the Music button and the credit, with a track (14.2, 14.6, 1.15)", () => {
  function Harness() {
    const [popover, setPopover] = useState<Popover>("none");
    const [on, setOn] = useState(false);
    return (
      <Header
        tag="Sample scan"
        theme="dark"
        apiConfigured={true}
        popover={popover}
        onPopover={setPopover}
        onScan={() => undefined}
        onHome={() => undefined}
        onGuide={() => undefined}
        onTour={() => undefined}
        music={{ on, onToggle: () => { setOn((v) => !v); } }}
      />
    );
  }

  it("renders Music between Legend and Tour, starting off, and presses it on and off", () => {
    render(<Harness />);
    const names = [...document.querySelectorAll(".header-buttons button.ib")].map((b) => b.textContent);
    expect(names).toEqual(["What is Sexton?", "Legend", "Music", "Tour"]);
    const music = screen.getByRole("button", { name: "Music" });
    expect(music.getAttribute("aria-pressed")).toBe("false");
    act(() => {
      music.click();
    });
    expect(music.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the credit line with an https source link in the site footer", () => {
    render(<SiteFooter model={headerModel(cheapScan(1), true)} track={SAMPLE} />);
    const credit = document.querySelector(".footer-credit") as HTMLElement;
    expect(credit.textContent).toBe("Music: “A Title” by An Artist, CC BY 4.0. Source");
    expect(credit.querySelector("a")?.getAttribute("href")).toBe("https://example.org/track");
    cleanup();
    render(<SiteFooter model={headerModel(cheapScan(1), true)} track={{ ...SAMPLE, source: "javascript:alert(1)" }} />);
    expect(document.querySelector(".footer-credit a")).toBeNull();
  });
});

describe("useMusic (14.3, 14.4, 14.7)", () => {
  function fakeAudio() {
    const element = { loop: false, play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
    const make = vi.fn<MakeAudio>(() => element as unknown as HTMLAudioElement);
    return { element, make };
  }

  it("makes no audio element before the first turn-on, then one that loops, and drives the beat only while on", () => {
    const { element, make } = fakeAudio();
    const { result, rerender } = renderHook(() => useMusic(SAMPLE, make));
    expect(result.current.on).toBe(false);
    expect(result.current.beat).toBeNull();
    expect(make).not.toHaveBeenCalled();
    act(() => {
      result.current.toggle();
    });
    expect(make).toHaveBeenCalledWith("/music/sample.mp3");
    expect(element.loop).toBe(true);
    expect(element.play).toHaveBeenCalledTimes(1);
    expect(result.current.beat).toEqual({ beatMs: 500 });
    const first = result.current.beat;
    rerender();
    expect(result.current.beat).toBe(first);
    act(() => {
      result.current.toggle();
    });
    expect(element.pause).toHaveBeenCalledTimes(1);
    expect(result.current.on).toBe(false);
    expect(result.current.beat).toBeNull();
    act(() => {
      result.current.toggle();
    });
    expect(make).toHaveBeenCalledTimes(1);
    expect(element.play).toHaveBeenCalledTimes(2);
  });

  it("turns off again when the browser refuses to play, and does nothing with no track", async () => {
    const { element, make } = fakeAudio();
    element.play.mockImplementation(() => Promise.reject(new Error("NotAllowedError")));
    const { result } = renderHook(() => useMusic(SAMPLE, make));
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(result.current.on).toBe(false);
    });
    const none = renderHook(() => useMusic(null, make));
    act(() => {
      none.result.current.toggle();
    });
    expect(none.result.current.on).toBe(false);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("gives one beat in milliseconds from the tempo, or none for a tempo that is not positive", () => {
    expect(beatMs(SAMPLE)).toBe(500);
    for (const bpm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(beatMs({ ...SAMPLE, bpm })).toBeNull();
  });
});

describe("the Pose clock (14.3 to 14.5)", () => {
  it("steps once per half beat with a beat, once per FRAME_MS without, and holds still under Reduced motion", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 200, max: 2000 }), fc.integer({ min: 1, max: 24 }), fc.nat(), (now, beat, count, offset) => {
        const b = { beatMs: beat };
        expect(poseClock(now, b, false)).toBe(Math.floor(now / (beat / 2)));
        expect(poseClock(now, null, false)).toBe(Math.floor(now / FRAME_MS));
        expect(poseClock(now, b, true)).toBeNull();
        expect(poseAt(now, count, true, offset, b)).toBe(STILL_POSE);
        expect(poseAt(now, count, false, offset)).toBe(poseAt(now, count, false, offset, null));
        const pose = poseAt(now, count, false, offset, b);
        expect(poseAt(now + beat / 2, count, false, offset, b)).toBe((pose + 1) % count);
      }),
      { numRuns: 100 },
    );
    expect(poseStepMs(null)).toBe(FRAME_MS);
    expect(poseStepMs({ beatMs: 0 })).toBe(FRAME_MS);
  });

  it("carries the beat into the plan only while motion is allowed", () => {
    const base = { packages: [scenePackage("a", "Possessed", "none")], width: 400, theme: "dark" as const, selectedIndex: null, ghostPhase: 0 };
    expect(planScene({ ...base, beat: { beatMs: 500 } }).beat).toEqual({ beatMs: 500 });
    expect(planScene({ ...base, beat: { beatMs: 500 }, reducedMotion: true }).beat).toBeUndefined();
    expect(planScene(base).beat).toBeUndefined();
  });

  it("repaints the Scene every half beat while the beat is on", () => {
    vi.useFakeTimers();
    const plan = planScene({ packages: [scenePackage("a", "Possessed", "none")], width: 400, theme: "dark", selectedIndex: null, ghostPhase: 0, beat: { beatMs: 1000 } });
    render(<Scene plan={plan} />);
    const paints = (): number => canvasCalls().filter((c) => c.method === "clearRect").length;
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const before = paints();
    // Under a 500 ms half beat, 400 ms brings no step, though FRAME_MS steps would have come.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(paints()).toBe(before);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(paints()).toBeGreaterThanOrEqual(before + 2);
  });
});
