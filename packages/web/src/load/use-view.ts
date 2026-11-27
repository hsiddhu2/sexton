// The page's one owner of what is open (spec clean-site, design C1 and C8): a ScreenState changed only through
// `reduce`, with the View address kept in step. Each change is pushed, replaced or left out of the history by
// `historyStep`; Back and Forward restore the View their entry names; a Drawer close that is not Back goes back over
// the entry its opening added.
import { useCallback, useEffect, useRef, useState } from "react";
import { historyStep } from "./history-step.js";
import { currentDrawerPushed, pushEntry, replaceEntry } from "./page-history.js";
import { initialScreen, reduce, type ScreenEvent, type ScreenState } from "./screen-state.js";
import { parseView, type View } from "./view-address.js";

/** "replace" forces the current entry to change in place: a part the loaded scan does not have is dropped (10.9). */
export type Dispatch = (event: ScreenEvent, how?: "replace") => void;

export interface ViewStore {
  readonly state: ScreenState;
  readonly dispatch: Dispatch;
}

/** How long a Back step the page takes itself may wait for its popstate before it lands anyway. */
export const BACK_STEP_WAIT_MS = 500;

interface PendingBack {
  /** The View the Back step lands on: the view beneath the Drawer as the close left it. */
  readonly land: View;
  /** History writes asked for while the Back step runs, in order. */
  readonly queue: (() => void)[];
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface UseViewOptions {
  /** True with an API base, so a `repo=` address names a Live scan (design C8). */
  readonly hosted: boolean;
}

export function useView(initial: View, { hosted }: UseViewOptions = { hosted: false }): ViewStore {
  const [state, setState] = useState(() => initialScreen(initial));
  const ref = useRef(state);
  const pending = useRef<PendingBack | null>(null);

  const land = useCallback((): void => {
    const p = pending.current;
    if (p === null) return;
    pending.current = null;
    clearTimeout(p.timer);
    replaceEntry(p.land);
    for (const write of p.queue) write();
  }, []);

  /** Runs a history write now, or after the page's own Back step has landed. */
  const write = useCallback((run: () => void): void => {
    const p = pending.current;
    if (p === null) run();
    else p.queue.push(run);
  }, []);

  const dispatch = useCallback<Dispatch>(
    (event, how) => {
      const prev = ref.current;
      const next = reduce(prev, event);
      if (next === prev) return;
      ref.current = next;
      setState(next);
      const view = next.view;
      const step = how === "replace" ? "replace" : historyStep(prev, next, event);
      switch (step) {
        case "none":
          return;
        case "replace":
          write(() => {
            replaceEntry(view, view.grave !== null && currentDrawerPushed());
          });
          return;
        case "drawer":
          write(() => {
            pushEntry(view, true);
          });
          return;
        case "push":
          // Over the Drawer's own entry the new View takes its place, so no Back step races the push (design C8).
          write(() => {
            if (currentDrawerPushed()) replaceEntry(view);
            else pushEntry(view);
          });
          return;
        case "back":
          write(() => {
            if (!currentDrawerPushed()) {
              replaceEntry(view);
              return;
            }
            // A Back step that never reports back must not hold every later write.
            pending.current = { land: view, queue: [], timer: setTimeout(land, BACK_STEP_WAIT_MS) };
            try {
              window.history.back();
            } catch {
              land();
            }
          });
          return;
      }
    },
    [land, write],
  );

  // The first entry carries the canonical View it shows, so a part a view does not take leaves the address (10.9).
  useEffect(() => {
    const view = ref.current.view;
    replaceEntry(view, view.grave !== null && currentDrawerPushed());
    // Runs once per mount: the first address is written a single time.
  }, []);

  // Back and Forward show the View their entry names (10.4); the page's own Back step lands where the page says.
  useEffect(() => {
    const onPop = (): void => {
      if (pending.current !== null) {
        land();
        return;
      }
      const prev = ref.current;
      const next = reduce(prev, { kind: "restore", view: parseView(window.location.search, hosted) });
      if (next === prev) return;
      ref.current = next;
      setState(next);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const p = pending.current;
      if (p !== null) clearTimeout(p.timer);
      pending.current = null;
    };
  }, [hosted, land]);

  return { state, dispatch };
}
