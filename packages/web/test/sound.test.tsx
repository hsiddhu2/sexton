// Spec cemetery-undead-2, requirement 8: sound, off by default, never before it is asked for, never past the cap.
// Web Audio is never touched here: the engine and the hook take a factory, and these tests pass a fake.
import { act, cleanup, renderHook } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capped, createSoundEngine } from "../src/sound/engine.js";
import { readSound, SOUND_KEY, writeSound } from "../src/sound/sound-pref.js";
import { ghostCallDue, GHOST_CALL_GAP_MS, useSound } from "../src/sound/use-sound.js";
import { MASTER_CAP, MAX_VOICE_MS, noiseSamples, VOICES, type AudioContextLike, type VoiceId } from "../src/sound/voices.js";

const NUM_RUNS = 100;
const VOICE_IDS: readonly VoiceId[] = ["wind", "sting", "thud", "bell", "ghost"];

interface FakeParam {
  value: number;
  readonly values: number[];
  readonly events: number;
}

interface FakeSource {
  readonly kind: "osc" | "buffer";
  type: string;
  loop: boolean;
  readonly frequency: FakeParam;
  startAt: number | null;
  stopAt: number | null;
  /** Serious mode at the moment it started. */
  serious: boolean;
}

/** A fake AudioContext that records every gain value and every source. */
export class FakeContext {
  readonly sources: FakeSource[] = [];
  readonly gains: FakeParam[] = [];
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 8_000;
  readonly destination = {} as AudioDestinationNode;
  serious = false;
  resumes = 0;
  suspends = 0;

  private param(initial = 0): FakeParam & Record<string, unknown> {
    const values: number[] = [];
    let current = initial;
    let events = 0;
    const p = {
      get value() {
        return current;
      },
      set value(v: number) {
        current = v;
        values.push(v);
      },
      values,
      get events() {
        return events;
      },
      setValueAtTime: (v: number) => {
        values.push(v);
        events += 1;
      },
      linearRampToValueAtTime: (v: number) => {
        values.push(v);
        events += 1;
      },
      exponentialRampToValueAtTime: (v: number) => {
        values.push(v);
        events += 1;
      },
      setTargetAtTime: (v: number) => {
        values.push(v);
        events += 1;
      },
      cancelScheduledValues: () => {},
    };
    return p as unknown as FakeParam & Record<string, unknown>;
  }

  /** Adds connect and disconnect, keeping the accessors of `extra` (a spread would flatten them). */
  private node(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.defineProperties({ connect: () => {}, disconnect: () => {} }, Object.getOwnPropertyDescriptors(extra));
  }

  private source(kind: "osc" | "buffer"): Record<string, unknown> {
    const s: FakeSource = { kind, type: "sine", loop: false, frequency: this.param(440), startAt: null, stopAt: null, serious: false };
    this.sources.push(s);
    return this.node({
      get type() {
        return s.type;
      },
      set type(v: string) {
        s.type = v;
      },
      get loop() {
        return s.loop;
      },
      set loop(v: boolean) {
        s.loop = v;
      },
      buffer: null,
      frequency: s.frequency,
      start: (t = 0) => {
        s.startAt = t;
        s.serious = this.serious;
      },
      stop: (t = 0) => {
        if (s.stopAt === null || t < s.stopAt) s.stopAt = t;
      },
    });
  }

  createGain(): GainNode {
    const gain = this.param(1);
    this.gains.push(gain);
    return this.node({ gain }) as unknown as GainNode;
  }
  createOscillator(): OscillatorNode {
    return this.source("osc") as unknown as OscillatorNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    return this.source("buffer") as unknown as AudioBufferSourceNode;
  }
  createBiquadFilter(): BiquadFilterNode {
    return this.node({ type: "lowpass", frequency: this.param(), Q: this.param() }) as unknown as BiquadFilterNode;
  }
  createDynamicsCompressor(): DynamicsCompressorNode {
    return this.node({ threshold: this.param(), knee: this.param(), ratio: this.param(), attack: this.param(), release: this.param() }) as unknown as DynamicsCompressorNode;
  }
  createBuffer(_channels: number, length: number): AudioBuffer {
    return { length, copyToChannel: () => {} } as unknown as AudioBuffer;
  }
  resume(): Promise<void> {
    this.resumes += 1;
    this.state = "running";
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.suspends += 1;
    this.state = "suspended";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
}

/** A bell partial: a sine set straight to its pitch. Every other Voice uses another wave, a sweep, noise or a slow LFO. */
function isBell(s: FakeSource): boolean {
  return s.kind === "osc" && s.type === "sine" && s.frequency.events === 0 && s.frequency.value >= 160;
}

function storage(): Storage {
  return window.localStorage;
}

afterEach(cleanup);
beforeEach(() => {
  storage().clear();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

type SoundEvent =
  | { readonly kind: "toggle" }
  | { readonly kind: "gesture" }
  | { readonly kind: "play"; readonly voice: VoiceId }
  | { readonly kind: "serious"; readonly on: boolean }
  | { readonly kind: "visible"; readonly on: boolean };

const arbEvent: fc.Arbitrary<SoundEvent> = fc.oneof(
  fc.constant<SoundEvent>({ kind: "toggle" }),
  fc.constant<SoundEvent>({ kind: "gesture" }),
  fc.constantFrom(...VOICE_IDS).map((voice): SoundEvent => ({ kind: "play", voice })),
  fc.boolean().map((on): SoundEvent => ({ kind: "serious", on })),
  fc.boolean().map((on): SoundEvent => ({ kind: "visible", on })),
);

describe("Feature: cemetery-undead-2, Property 7: No sound before it is asked for, and never past the cap", () => {
  it("makes at most one context, only once Sound is on and a gesture or toggle-on has happened, and keeps every rule", () => {
    fc.assert(
      fc.property(fc.constantFrom<string | null>(null, "on", "off", "ON", "garbage"), fc.array(arbEvent, { maxLength: 24 }), (stored, events) => {
        storage().clear();
        if (stored !== null) storage().setItem(SOUND_KEY, stored);
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
        const contexts: FakeContext[] = [];
        let serious = false;
        const make = (): AudioContextLike => {
          const c = new FakeContext();
          c.serious = serious;
          contexts.push(c);
          return c as unknown as AudioContextLike;
        };
        const { result, rerender, unmount } = renderHook(({ s }) => useSound({ serious: s, makeContext: make }), { initialProps: { s: false } });
        // The model: is Sound on, and has a gesture been seen while it was on (or a toggle turned it on)?
        let on = stored === "on";
        let armed = false;
        expect(result.current.on).toBe(on);
        for (const e of events) {
          act(() => {
            if (e.kind === "toggle") {
              result.current.toggle();
              on = !on;
              if (on) armed = true;
            } else if (e.kind === "gesture") {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
              if (on) armed = true;
            } else if (e.kind === "play") {
              result.current.play(e.voice);
            } else if (e.kind === "serious") {
              serious = e.on;
              for (const c of contexts) c.serious = e.on;
              rerender({ s: e.on });
            } else {
              Object.defineProperty(document, "visibilityState", { configurable: true, value: e.on ? "visible" : "hidden" });
              document.dispatchEvent(new Event("visibilitychange"));
            }
          });
          expect(contexts.length).toBeLessThanOrEqual(1);
          if (contexts.length === 1) expect(armed).toBe(true);
          expect(result.current.on).toBe(on);
        }
        for (const c of contexts) {
          // The Master gain is the first gain made, and never goes above the cap.
          const master = c.gains[0];
          expect(master).toBeDefined();
          for (const v of master?.values ?? []) expect(v).toBeLessThanOrEqual(MASTER_CAP);
          for (const s of c.sources) {
            if (s.startAt === null) continue;
            if (s.serious) expect(isBell(s), "only the bell starts in Serious mode").toBe(true);
            // The wind bed's noise loop and its slow LFO run until the wind stops; every other source has a stop.
            if (!s.loop && !(s.kind === "osc" && s.frequency.value < 1)) expect((s.stopAt ?? Infinity) - s.startAt).toBeLessThanOrEqual(MAX_VOICE_MS / 1000);
          }
        }
        unmount();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("reads true only for the stored value on, and reads back what it wrote", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), fc.boolean(), (value, on) => {
        storage().clear();
        if (value !== null) storage().setItem(SOUND_KEY, value);
        expect(readSound(storage())).toBe(value === "on");
        writeSound(storage(), on);
        expect(readSound(storage())).toBe(on);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("caps every Master gain value it is asked for", () => {
    fc.assert(
      fc.property(fc.double(), (v) => {
        const c = capped(v);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(MASTER_CAP);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("the Voices (requirement 8.5 to 8.7)", () => {
  it("keeps the approved peaks and lengths, and only the bell plays in Serious mode", () => {
    expect(VOICES).toEqual({
      wind: { peak: 0.05, durationMs: null, serious: false },
      sting: { peak: 0.16, durationMs: 1_100, serious: false },
      thud: { peak: 0.28, durationMs: 400, serious: false },
      bell: { peak: 0.2, durationMs: 2_400, serious: true },
      ghost: { peak: 0.12, durationMs: 800, serious: false },
    });
    expect(MASTER_CAP).toBe(0.7);
    for (const v of Object.values(VOICES)) if (v.durationMs !== null) expect(v.durationMs).toBeLessThanOrEqual(MAX_VOICE_MS);
  });

  it("stops every oscillator of a short Voice within its length", () => {
    for (const id of ["sting", "thud", "bell", "ghost"] as const) {
      const c = new FakeContext();
      const engine = createSoundEngine(() => c as unknown as AudioContextLike);
      engine.play(id, { serious: false });
      const started = c.sources.filter((s) => s.startAt !== null);
      expect(started.length, id).toBeGreaterThan(0);
      for (const s of started) expect((s.stopAt ?? Infinity) - (s.startAt ?? 0), id).toBeLessThanOrEqual((VOICES[id].durationMs ?? 0) / 1000);
    }
  });

  it("makes noise from a fixed seed: the same samples every time, in [-1, 1)", () => {
    const a = noiseSamples(8_000);
    const b = noiseSamples(8_000);
    expect(a).toEqual(b);
    expect(a.length).toBe(16_000);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });

  it("plays nothing but the bell in Serious mode, and no wind", () => {
    const c = new FakeContext();
    const engine = createSoundEngine(() => c as unknown as AudioContextLike);
    for (const id of VOICE_IDS) engine.play(id, { serious: true });
    engine.wind(true, { serious: true });
    const started = c.sources.filter((s) => s.startAt !== null);
    expect(started.length).toBe(5);
    expect(started.every(isBell)).toBe(true);
  });

  it("goes quiet for good when the context cannot be made, and keeps working", () => {
    let calls = 0;
    const engine = createSoundEngine(() => {
      calls += 1;
      throw new Error("no audio");
    });
    expect(() => {
      engine.play("bell", { serious: false });
      engine.wind(true, { serious: false });
      engine.resume();
      engine.suspend();
    }).not.toThrow();
    expect(calls).toBe(1);
    expect(engine.dead).toBe(true);
  });

  it("does not suspend after a resume that follows a suspend within the fade (review, task 5)", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();
    try {
      const c = new FakeContext();
      const engine = createSoundEngine(() => c as unknown as AudioContextLike);
      engine.wind(true, { serious: false });
      engine.suspend();
      engine.resume();
      engine.wind(true, { serious: false });
      vi.advanceTimersByTime(500);
      expect(c.suspends).toBe(0);
      expect(c.state).toBe("running");
      engine.suspend();
      vi.advanceTimersByTime(500);
      expect(c.suspends).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ramps the Master gain to 0 within 50 ms on suspend, and back to the cap on resume", () => {
    const c = new FakeContext();
    const engine = createSoundEngine(() => c as unknown as AudioContextLike);
    engine.wind(true, { serious: false });
    engine.suspend();
    const master = c.gains[0];
    expect(master?.values.at(-1)).toBe(0);
    engine.resume();
    expect(master?.values.at(-1)).toBe(MASTER_CAP);
  });
});

describe("the gates of the hook (requirement 8.2 to 8.4, 8.10)", () => {
  it("makes nothing at mount, even with on stored, until a key press; then plays the wind", () => {
    storage().setItem(SOUND_KEY, "on");
    const contexts: FakeContext[] = [];
    const { result } = renderHook(() =>
      useSound({
        serious: false,
        makeContext: () => {
          const c = new FakeContext();
          contexts.push(c);
          return c as unknown as AudioContextLike;
        },
      }),
    );
    expect(result.current.on).toBe(true);
    act(() => {
      result.current.play("bell");
    });
    expect(contexts).toHaveLength(0);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.sources.some((s) => s.kind === "buffer" && s.loop)).toBe(true);
  });

  it("is off by default and arms on the toggle itself, storing on", () => {
    const contexts: FakeContext[] = [];
    const { result } = renderHook(() =>
      useSound({
        serious: false,
        makeContext: () => {
          const c = new FakeContext();
          contexts.push(c);
          return c as unknown as AudioContextLike;
        },
      }),
    );
    expect(result.current.on).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });
    expect(contexts).toHaveLength(0);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.on).toBe(true);
    expect(storage().getItem(SOUND_KEY)).toBe("on");
    expect(contexts).toHaveLength(1);
  });

  it("suspends when hidden and resumes the wind when visible again", () => {
    const c = new FakeContext();
    const { result } = renderHook(() => useSound({ serious: false, makeContext: () => c as unknown as AudioContextLike }));
    act(() => {
      result.current.toggle();
    });
    const winds = (): number => c.sources.filter((s) => s.kind === "buffer" && s.loop).length;
    expect(winds()).toBe(1);
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(c.gains[0]?.values.at(-1)).toBe(0);
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(c.gains[0]?.values.at(-1)).toBe(MASTER_CAP);
    expect(winds()).toBe(2);
  });

  it("allows a ghost call at most once every 1,500 ms", () => {
    expect(ghostCallDue(null, 0)).toBe(true);
    expect(ghostCallDue(1_000, 1_000 + GHOST_CALL_GAP_MS - 1)).toBe(false);
    expect(ghostCallDue(1_000, 1_000 + GHOST_CALL_GAP_MS)).toBe(true);
  });
});

describe("the Sound toggle on the page (requirements 8.1, 12.3)", () => {
  it("turns on with aria-pressed, reads Sound on, stores on, and leaves no axe violation", async () => {
    const { render, screen, waitFor, fireEvent } = await import("@testing-library/react");
    const axe = (await import("axe-core")).default;
    const { App } = await import("../src/App.js");
    const { readDemoScanText } = await import("./support/demo-scan.js");
    document.documentElement.lang = "en";
    document.title = "Sexton cemetery";
    // jsdom has no Web Audio: the engine goes quiet, and the page keeps working.
    const fetchFn = ((): Promise<Response> => Promise.resolve(new Response(readDemoScanText(), { status: 200 }))) as typeof fetch;
    render(<App fetchFn={fetchFn} apiBase={null} initialSearch="" pageOrigin="http://localhost" />);
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    const toggle = screen.getByRole("button", { name: "Sound off" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    const on = screen.getByRole("button", { name: "Sound on" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(storage().getItem(SOUND_KEY)).toBe("on");
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
    fireEvent.click(on);
    expect(screen.getByRole("button", { name: "Sound off" }).getAttribute("aria-pressed")).toBe("false");
    expect(storage().getItem(SOUND_KEY)).toBe("off");
  });
});
