// Spec clean-site, tasks 10 and 16: the Track slot (requirement 14). It holds Ghost Party, whose one file ships under
// public (the CSP half is in vite-csp.test.ts); the button starts off, one audio element is made on the first turn-on,
// the Characters' Pose clock follows the beat, and the credit shows word for word.
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
import { GuidePage } from "../src/guide/GuidePage.js";
import { SiteFooter } from "../src/home/SiteFooter.js";
import type { Popover } from "../src/load/screen-state.js";
import { beatMs, creditParts, TRACK, type Track } from "../src/music/track.js";
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
const CREDITS = readFileSync(resolve(HERE, "../../../CREDITS.md"), "utf8");
const AUDIO = /\.(mp3|ogg|oga|opus|wav|flac|aac|m4a|weba|webm|mid|midi)$/i;

const SAMPLE: Track = {
  file: "/music/sample.mp3",
  title: "A Title",
  artist: "An Artist",
  licence: "CC BY 4.0",
  source: "https://example.org/track",
  bpm: 120,
  credit: ["A Title by An Artist | https://example.org/track", "CC BY 4.0"],
  footer: [
    { text: "Music: ", href: null },
    { text: "A Title by An Artist", href: "https://example.org/track" },
    { text: ", ", href: null },
    { text: "CC BY 4.0", href: "javascript:alert(1)" },
  ],
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** The credit of Ghost Party, word for word, as its licence asks (14.6). */
const GHOST_PARTY_CREDIT = [
  "Ghost Party by The Piano Says | https://soundcloud.com/thepianosays",
  "Royalty Free Music by https://www.free-stock-music.com",
  "Creative Commons / Attribution 3.0 Unported License (CC BY 3.0)",
  "https://creativecommons.org/licenses/by/3.0/deed.en_US",
];

/** The site footer's one-line credit of Ghost Party, its title and licence linked (14.6). */
const GHOST_PARTY_FOOTER = [
  { text: "Music: ", href: null },
  { text: "Ghost Party by The Piano Says", href: "https://soundcloud.com/thepianosays" },
  { text: ", ", href: null },
  { text: "CC BY 3.0", href: "https://creativecommons.org/licenses/by/3.0/deed.en_US" },
];

describe("the Track slot holds Ghost Party (14.1, 14.2, 14.6, 14.7, 1.15)", () => {
  it("names the track, its licence, source and tempo, and ships its one audio file under public", () => {
    expect(TRACK).toEqual({
      file: "/music/ghost-party.mp3",
      title: "Ghost Party",
      artist: "The Piano Says",
      licence: "CC BY 3.0",
      source: "https://soundcloud.com/thepianosays",
      bpm: 110,
      credit: GHOST_PARTY_CREDIT,
      footer: GHOST_PARTY_FOOTER,
    });
    const audio = files(PUBLIC).filter((f) => AUDIO.test(f));
    expect(audio).toEqual([join(PUBLIC, "music", "ghost-party.mp3")]);
    expect(statSync(audio[0] ?? "").size).toBeGreaterThan(0);
  });

  it("renders the Music button off, and makes no audio element on the page until it is pressed", async () => {
    const audio = vi.spyOn(window, "Audio");
    const make = vi.spyOn(document, "createElement");
    const fetchFn = ((): Promise<Response> => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as typeof fetch;
    const { container } = render(<App fetchFn={fetchFn} apiBase={null} initialSearch="" pageOrigin="http://localhost" />);
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    const music = screen.getByRole("button", { name: "Music" });
    expect(music.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("audio")).toBeNull();
    expect(audio).not.toHaveBeenCalled();
    expect(make.mock.calls.filter(([tag]) => String(tag).toLowerCase() === "audio")).toEqual([]);
    // The site footer holds the one-line credit, inside its one line (14.6).
    const credit = container.querySelector(".site-footer-line .footer-credit");
    expect(credit?.textContent).toBe("Music: Ghost Party by The Piano Says, CC BY 3.0");
    expect([...(credit?.querySelectorAll("a") ?? [])].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Ghost Party by The Piano Says", "https://soundcloud.com/thepianosays"],
      ["CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/deed.en_US"],
    ]);
    expect(container.querySelectorAll(".footer-credit-line")).toHaveLength(0);
  });

  it("puts the credit in README.md and CREDITS.md word for word (14.6)", () => {
    expect(TRACK).not.toBeNull();
    for (const text of [README, CREDITS]) {
      const lines = text.split("\n").map((l) => l.trim());
      for (const line of GHOST_PARTY_CREDIT) expect(lines, line).toContain(line);
    }
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

  it("shows the one-line credit in the site footer line, linking only https addresses", () => {
    render(<SiteFooter model={headerModel(cheapScan(1), true)} track={SAMPLE} />);
    const credit = document.querySelector(".site-footer-line .footer-credit");
    expect(credit?.textContent).toBe("Music: A Title by An Artist, CC BY 4.0");
    // The licence part's address is not https, so it stays plain text.
    expect([...document.querySelectorAll(".footer-credit a")].map((a) => a.getAttribute("href"))).toEqual(["https://example.org/track"]);
    expect([...document.querySelectorAll(".footer-credit a")].map((a) => a.getAttribute("rel"))).toEqual(["noopener noreferrer"]);
    cleanup();
    render(<SiteFooter model={headerModel(cheapScan(1), true)} track={null} />);
    expect(document.querySelector(".footer-credit")).toBeNull();
  });

  it("shows the full credit line by line under the heading Music on the Guide page, linking only its https addresses", () => {
    render(<GuidePage theme="dark" onHome={() => undefined} onAttack={() => undefined} track={SAMPLE} />);
    expect(screen.getByRole("heading", { level: 2, name: "Music" })).toBeDefined();
    expect([...document.querySelectorAll(".guide-credit-line")].map((l) => l.textContent)).toEqual(SAMPLE.credit);
    expect([...document.querySelectorAll(".guide-credit a")].map((a) => a.getAttribute("href"))).toEqual(["https://example.org/track"]);
    cleanup();
    render(<GuidePage theme="dark" onHome={() => undefined} onAttack={() => undefined} track={{ ...SAMPLE, credit: ["Source javascript:alert(1) http://example.org"] }} />);
    expect(document.querySelector(".guide-credit a")).toBeNull();
    expect(document.querySelector(".guide-credit")?.textContent).toBe("Source javascript:alert(1) http://example.org");
    cleanup();
    render(<GuidePage theme="dark" onHome={() => undefined} onAttack={() => undefined} track={null} />);
    expect(screen.queryByRole("heading", { name: "Music" })).toBeNull();
    expect(document.querySelector(".guide-credit")).toBeNull();
  });

  it("splits a credit line into its text and its https addresses, losing no character", () => {
    expect(creditParts("Ghost Party by The Piano Says | https://soundcloud.com/thepianosays")).toEqual([
      { text: "Ghost Party by The Piano Says | ", href: null },
      { text: "https://soundcloud.com/thepianosays", href: "https://soundcloud.com/thepianosays" },
    ]);
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.string(), fc.webUrl()), { maxLength: 5 }), (parts) => {
        const line = parts.join(" ");
        const out = creditParts(line);
        expect(out.map((p) => p.text).join("")).toBe(line);
        for (const p of out) if (p.href !== null) expect(p.href).toMatch(/^https:\/\/[^\s|]+$/);
      }),
      { numRuns: 100 },
    );
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
