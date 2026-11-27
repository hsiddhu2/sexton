// jsdom stubs: canvas 2D context, Path2D, matchMedia, ResizeObserver, requestAnimationFrame.
import { afterEach, beforeEach } from "vitest";
import { setLoadMomentPlayedForTests } from "../src/scene/load-moment.js";

export interface CanvasCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface StubState {
  calls: CanvasCall[];
  paints: number;
  media: Map<string, boolean>;
  mediaListeners: Map<string, Set<(e: { matches: boolean; media: string }) => void>>;
  resizeObservers: Set<StubResizeObserver>;
  frames: Map<number, FrameRequestCallback>;
  nextFrameId: number;
}

const state: StubState = {
  calls: [],
  paints: 0,
  media: new Map(),
  mediaListeners: new Map(),
  resizeObservers: new Set(),
  frames: new Map(),
  nextFrameId: 1,
};

class StubPath2D {
  readonly d: string;
  constructor(d?: string) {
    this.d = d ?? "";
  }
}

class StubResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(): void {
    state.resizeObservers.add(this);
  }
  unobserve(): void {
    state.resizeObservers.delete(this);
  }
  disconnect(): void {
    state.resizeObservers.delete(this);
  }
  trigger(width: number, height: number): void {
    const entry = { contentRect: { width, height } } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

function makeContext(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return (...args: unknown[]) => {
        state.calls.push({ method: prop, args });
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return { addColorStop() {} };
        if (prop === "clearRect") state.paints += 1;
        return undefined;
      };
    },
    set(obj, prop: string, value: unknown) {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function matchMediaStub(query: string): MediaQueryList {
  const listeners = state.mediaListeners.get(query) ?? new Set();
  state.mediaListeners.set(query, listeners);
  const list = {
    media: query,
    get matches() {
      return state.media.get(query) ?? false;
    },
    onchange: null,
    addEventListener: (_type: string, fn: (e: { matches: boolean; media: string }) => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_type: string, fn: (e: { matches: boolean; media: string }) => void) => {
      listeners.delete(fn);
    },
    addListener: (fn: (e: { matches: boolean; media: string }) => void) => {
      listeners.add(fn);
    },
    removeListener: (fn: (e: { matches: boolean; media: string }) => void) => {
      listeners.delete(fn);
    },
    dispatchEvent: () => true,
  };
  return list as unknown as MediaQueryList;
}

function install(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g["Path2D"] = StubPath2D;
  g["ResizeObserver"] = StubResizeObserver;
  window.matchMedia = matchMediaStub;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return makeContext();
  } as unknown as HTMLCanvasElement["getContext"];
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = state.nextFrameId++;
    state.frames.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    state.frames.delete(id);
  };
}

function reset(): void {
  state.calls = [];
  state.paints = 0;
  state.media.clear();
  state.mediaListeners.clear();
  state.resizeObservers.clear();
  state.frames.clear();
  state.nextFrameId = 1;
}

beforeEach(() => {
  // The Load moment (spec cemetery-undead-2, B5) counts as played, so existing tests see the scene at rest. Its own
  // tests clear this.
  setLoadMomentPlayedForTests(true);
  install();
});

afterEach(async () => {
  reset();
  // A Back step the page took (a Drawer close, spec clean-site 10.17) lands a task later. Let it land here, after the
  // case has unmounted, then start the next case on "/", so no popstate reaches the next case's page.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    window.history.replaceState(null, "", "/");
  } catch {
    // A case that replaced the history API keeps its own.
  }
});

install();

/** Number of clearRect calls recorded since the last reset. */
export function paintCount(): number {
  return state.paints;
}

/** Every recorded canvas call. */
export function canvasCalls(): readonly CanvasCall[] {
  return state.calls;
}

/** Sets a media query result and notifies its listeners. */
export function setMedia(query: string, matches: boolean): void {
  state.media.set(query, matches);
  for (const fn of state.mediaListeners.get(query) ?? []) fn({ matches, media: query });
}

/** Notifies every observed ResizeObserver of a new size. */
export function triggerResize(width: number, height = 0): void {
  for (const observer of [...state.resizeObservers]) observer.trigger(width, height);
}

/** Runs every queued animation frame callback once. */
export function flushFrame(time = 0): void {
  const queued = [...state.frames.values()];
  state.frames.clear();
  for (const cb of queued) cb(time);
}
