// Spec cemetery-time-fixes, tasks 3.2 and 3.5: the opening Stop, the Play stepping and the Play timer.
import { act, renderHook } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAY_STEP_MS, openingStop, playStep, type PlayEvent, type PlayState } from "../src/time/play.js";
import { stopText } from "../src/time/Scrubber.js";
import { usePlay } from "../src/time/use-play.js";

type Cmd = { readonly kind: "play" } | { readonly kind: "tick" } | { readonly kind: "pause" } | { readonly kind: "seek"; readonly to: number };

/** A plain loop model of the rules of design.md "F3". */
function modelRun(n: number, replay: boolean, cmds: readonly Cmd[]): { index: number; playing: boolean }[] {
  let index = n === 0 || replay ? 0 : n - 1;
  let playing = false;
  const out = [{ index, playing }];
  for (const c of cmds) {
    if (c.kind === "play") {
      if (n >= 2) {
        if (index >= n - 1) index = 0;
        playing = true;
      }
    } else if (c.kind === "tick") {
      if (playing) {
        index += 1;
        if (index >= n - 1) {
          index = n - 1;
          playing = false;
        }
      }
    } else if (c.kind === "pause") {
      playing = false;
    } else {
      index = c.to < 0 ? 0 : Math.min(c.to, Math.max(n - 1, 0));
      playing = false;
    }
    out.push({ index, playing });
  }
  return out;
}

function toEvent(c: Cmd, n: number): PlayEvent {
  if (c.kind === "seek") return { type: "seek", index: c.to, count: n };
  if (c.kind === "pause") return { type: "pause" };
  return { type: c.kind, count: n };
}

const arbCmd: fc.Arbitrary<Cmd> = fc.oneof(
  fc.constant<Cmd>({ kind: "play" }),
  fc.constant<Cmd>({ kind: "tick" }),
  fc.constant<Cmd>({ kind: "tick" }),
  fc.constant<Cmd>({ kind: "pause" }),
  fc.integer({ min: -2, max: 45 }).map<Cmd>((to) => ({ kind: "seek", to })),
);

describe("Property 3: Play visits the Stops in order and ends at the last", () => {
  it("Feature: cemetery-time-fixes, Property 3: Play visits the Stops in order and ends at the last", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), fc.boolean(), fc.array(arbCmd, { maxLength: 60 }), (n, replay, cmds) => {
        const expected = modelRun(n, replay, cmds);
        let state: PlayState = playStep({ index: 7, playing: true }, { type: "load", count: n, replay });
        expect(state).toEqual({ index: replay || n === 0 ? 0 : n - 1, playing: false });
        expect(openingStop(n, replay)).toBe(state.index);
        const seen = [state];
        for (const c of cmds) {
          const before = state;
          state = playStep(state, toEvent(c, n));
          seen.push(state);
          expect(state.index).toBeGreaterThanOrEqual(0);
          expect(state.index).toBeLessThanOrEqual(Math.max(n - 1, 0));
          if (state.playing && !before.playing) {
            expect(c.kind).toBe("play");
            expect(n).toBeGreaterThanOrEqual(2);
          }
          if (c.kind === "pause" || c.kind === "seek") expect(state.playing).toBe(false);
        }
        expect(seen).toEqual(expected);
        // From the last state: play, then ticks, visits s .. n - 1 once each and stops at the last.
        const played = playStep(state, { type: "play", count: n });
        if (n < 2) {
          expect(played).toEqual(state);
          return;
        }
        const s = state.index >= n - 1 ? 0 : state.index;
        expect(played).toEqual({ index: s, playing: true });
        const visited = [played.index];
        let cur = played;
        while (cur.playing) {
          cur = playStep(cur, { type: "tick", count: n });
          visited.push(cur.index);
        }
        expect(visited).toEqual(Array.from({ length: n - s }, (_, k) => s + k));
        expect(cur).toEqual({ index: n - 1, playing: false });
        expect(playStep(cur, { type: "tick", count: n })).toEqual(cur);
      }),
      { numRuns: 100 },
    );
  });
});

describe("the Play timer (use-play.ts)", () => {
  const STOPS = [Date.UTC(2026, 2, 30, 23, 21), Date.UTC(2026, 2, 31, 0, 21), Date.UTC(2026, 2, 31, 3, 29)];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a replay at Stop 0 and any other response at its last Stop", () => {
    expect(renderHook(() => usePlay(STOPS, 1, true)).result.current.index).toBe(0);
    expect(renderHook(() => usePlay(STOPS, 1, false)).result.current.index).toBe(2);
  });

  it("makes no step without a press", () => {
    const { result } = renderHook(() => usePlay(STOPS, 1, true));
    act(() => {
      vi.advanceTimersByTime(10 * PLAY_STEP_MS);
    });
    expect(result.current).toMatchObject({ index: 0, playing: false, announce: "" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("steps once after 1,500 ms and not before, then stops at the last Stop, announcing each", () => {
    const { result } = renderHook(() => usePlay(STOPS, 1, true));
    act(() => {
      result.current.play();
    });
    expect(result.current).toMatchObject({ index: 0, playing: true, announce: `Playing from ${stopText(STOPS[0] as number)}` });
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS - 1);
    });
    expect(result.current.index).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toMatchObject({ index: 1, playing: true, announce: stopText(STOPS[1] as number) });
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS);
    });
    expect(result.current).toMatchObject({ index: 2, playing: false, announce: `End of history at ${stopText(STOPS[2] as number)}` });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pause keeps the Stop and clears the timer", () => {
    const { result } = renderHook(() => usePlay(STOPS, 1, true));
    act(() => {
      result.current.play();
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      result.current.pause();
    });
    expect(result.current).toMatchObject({ index: 0, playing: false, announce: `Paused at ${stopText(STOPS[0] as number)}` });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a seek stops playing, keeps the sought Stop and clears the live line", () => {
    const { result } = renderHook(() => usePlay(STOPS, 1, true));
    act(() => {
      result.current.play();
    });
    act(() => {
      result.current.seek(2);
    });
    expect(result.current).toMatchObject({ index: 2, playing: false, announce: "" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("play at the last Stop moves to the first and plays", () => {
    const { result } = renderHook(() => usePlay(STOPS, 1, false));
    act(() => {
      result.current.play();
    });
    expect(result.current).toMatchObject({ index: 0, playing: true });
  });

  it("unmount clears the timer", () => {
    const { result, unmount } = renderHook(() => usePlay(STOPS, 1, true));
    act(() => {
      result.current.play();
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a new load clears the timer and opens the new response by its own rule", () => {
    const { result, rerender } = renderHook(({ id, replay }: { id: number; replay: boolean }) => usePlay(STOPS, id, replay), {
      initialProps: { id: 1, replay: true },
    });
    act(() => {
      result.current.play();
    });
    rerender({ id: 2, replay: false });
    expect(result.current).toMatchObject({ index: 2, playing: false, announce: "" });
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(5 * PLAY_STEP_MS);
    });
    expect(result.current.index).toBe(2);
  });

  it("does nothing with one Stop", () => {
    const { result } = renderHook(() => usePlay([STOPS[0] as number], 1, true));
    act(() => {
      result.current.play();
    });
    expect(result.current).toMatchObject({ index: 0, playing: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});
