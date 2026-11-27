// The Root (spec home-page, design C2, requirements 1, 12 and 15): reads the Route from the page address, forwards an
// Old address in place, and shows the Home page or the Cemetery view. A move between the two adds one history entry;
// Back and Forward show the Route of the entry they land on. The Cemetery view mounts fresh on each entry, so its Scan
// field starts empty (12.4).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { App } from "../App.js";
import { HomePage } from "../home-page/HomePage.js";
import { applyPalette } from "../scene/palette.js";
import { routeOf, type Route } from "./route.js";

export const HOME_TITLE = "Sexton: find the dependencies that will hurt you";
export const CEMETERY_TITLE = "Sexton cemetery";

/** What a move into the Cemetery view was started by: a press that names a repository starts its scan (3.3, 14.3). */
export type NavIntent = "scan";
export type Navigate = (to: string, intent?: NavIntent) => void;

export interface RootProps {
  readonly fetchFn: typeof fetch;
  readonly apiBase: string | null;
  readonly pageOrigin: string;
}

type Shown = Exclude<Route, { readonly kind: "forward" }>;

function split(to: string): { readonly pathname: string; readonly search: string } {
  const url = new URL(to, "http://local.invalid");
  return { pathname: url.pathname, search: url.search };
}

/** The Route of the current address, after any forward (1.4 to 1.6). A refused replaceState keeps the address (1.10). */
function settle(): Shown {
  const first = routeOf(window.location.pathname, window.location.search);
  if (first.kind !== "forward") return first;
  try {
    window.history.replaceState(null, "", first.to);
  } catch {
    // History refused: show the Route and leave the address.
  }
  const { pathname, search } = split(first.to);
  const next = routeOf(pathname, search);
  return next.kind === "forward" ? { kind: "home" } : next;
}

export function Root({ fetchFn, apiBase, pageOrigin }: RootProps) {
  const [route, setRoute] = useState<Shown>(settle);
  // Each entry into the Cemetery view: a new key, and whether a press started its scan.
  const [visit, setVisit] = useState({ n: 0, startScan: false });
  const kind = useRef(route.kind);
  kind.current = route.kind;

  useLayoutEffect(() => {
    applyPalette(document.documentElement, "dark");
  }, []);
  useEffect(() => {
    document.title = route.kind === "home" ? HOME_TITLE : CEMETERY_TITLE;
  }, [route.kind]);

  /** Shows `next`, mounting the Cemetery view afresh when it is entered. */
  const show = useCallback((next: Shown, startScan = false): void => {
    if (next.kind === "cemetery") setVisit((v) => ({ n: v.n + 1, startScan }));
    setRoute(next);
    if (next.kind === "home") window.scrollTo(0, 0);
  }, []);

  // Back and Forward (1.9). A move inside the Cemetery view is the App's own (spec clean-site, C8).
  useEffect(() => {
    const onPop = (): void => {
      const next = settle();
      if (next.kind === "cemetery" && kind.current === "cemetery") return;
      if (next.kind === "home" && kind.current === "home") return;
      show(next);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [show]);

  const navigate = useCallback<Navigate>(
    (to, how) => {
      try {
        window.history.pushState(null, "", to);
      } catch {
        // History refused: the Route still changes (1.10).
      }
      const { pathname, search } = split(to);
      const next = routeOf(pathname, search);
      show(next.kind === "forward" ? { kind: "home" } : next, how === "scan");
    },
    [show],
  );

  if (route.kind === "home") return <HomePage apiBase={apiBase} onNavigate={navigate} />;
  return (
    <App
      key={visit.n}
      fetchFn={fetchFn}
      apiBase={apiBase}
      initialSearch={route.search}
      pageOrigin={pageOrigin}
      onNavigate={navigate}
      startScan={visit.startScan}
    />
  );
}
