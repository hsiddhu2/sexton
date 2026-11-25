import { useCallback, useEffect, useRef, useState } from "react";
import { BURIAL_MS, burialFrame } from "./burial.js";

export interface BurialInput {
  readonly reducedMotion: boolean;
  /** A burial queued while the drawer is open starts when it closes. */
  readonly drawerOpen: boolean;
}

export interface BurialState {
  /** Session list of packages with an opened pull request (spec cemetery-time, 14.4). */
  readonly session: ReadonlySet<string>;
  /** The packages whose pennant shows now: the session list minus a package still waiting or sinking. */
  readonly shown: ReadonlySet<string>;
  /** Packages whose pennant is held back: waiting for the drawer to close, or sinking before phase 0.65. */
  readonly held: ReadonlySet<string>;
  /** The burial that plays now, or null. */
  readonly burial: { readonly name: string; readonly phase: number } | null;
  /**
   * Under Reduced motion, the Vigil in place of a burial: the Priest stands still beside the grave for BURIAL_MS, with
   * no stone motion (spec cemetery-undead-2, requirement 10.3). It waits for the drawer to close, as a burial does.
   */
  readonly vigil: { readonly name: string; readonly startMs: number } | null;
  /** Call when the request ends with the status `opened` or `existing`. */
  readonly request: (packageName: string) => void;
}

/** One state per loaded scan: the owner remounts on a new response, which clears every list. */
export function useBurial({ reducedMotion, drawerOpen }: BurialInput): BurialState {
  const [session, setSession] = useState<readonly string[]>([]);
  const [queue, setQueue] = useState<readonly string[]>([]);
  const [active, setActive] = useState<{ readonly name: string; readonly phase: number } | null>(null);
  const played = useRef(new Set<string>());
  const [vigilQueue, setVigilQueue] = useState<readonly string[]>([]);
  const [vigil, setVigil] = useState<{ readonly name: string; readonly startMs: number } | null>(null);
  const kept = useRef(new Set<string>());

  const request = useCallback(
    (packageName: string): void => {
      setSession((list) => (list.includes(packageName) ? list : [...list, packageName]));
      if (reducedMotion) {
        if (kept.current.has(packageName)) return;
        kept.current.add(packageName);
        setVigilQueue((list) => [...list, packageName]);
        return;
      }
      if (played.current.has(packageName)) return;
      played.current.add(packageName);
      setQueue((list) => [...list, packageName]);
    },
    [reducedMotion],
  );

  useEffect(() => {
    if (drawerOpen || vigil !== null) return;
    const next = vigilQueue[0];
    if (next === undefined) return;
    setVigilQueue(vigilQueue.slice(1));
    setVigil({ name: next, startMs: Date.now() });
  }, [drawerOpen, vigil, vigilQueue]);

  useEffect(() => {
    if (vigil === null) return undefined;
    const timer = setTimeout(() => {
      setVigil(null);
    }, BURIAL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [vigil]);

  useEffect(() => {
    if (reducedMotion) {
      setActive(null);
      setQueue([]);
    }
  }, [reducedMotion]);

  useEffect(() => {
    if (drawerOpen || active !== null || reducedMotion) return;
    const next = queue[0];
    if (next === undefined) return;
    setQueue(queue.slice(1));
    setActive({ name: next, phase: 0 });
  }, [drawerOpen, active, queue, reducedMotion]);

  const activeName = active?.name ?? null;
  useEffect(() => {
    if (activeName === null) return;
    let start: number | null = null;
    let handle = 0;
    const step = (now: number): void => {
      start ??= now;
      const phase = Math.min(1, Math.max(0, (now - start) / BURIAL_MS));
      if (phase >= 1) {
        setActive(null);
        return;
      }
      setActive({ name: activeName, phase });
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(handle);
    };
  }, [activeName]);

  const hidden = new Set(queue);
  if (active !== null && !burialFrame(active.phase).marker) hidden.add(active.name);
  const shown = new Set(session.filter((name) => !hidden.has(name)));
  return { session: new Set(session), shown, held: hidden, burial: active, vigil, request };
}
