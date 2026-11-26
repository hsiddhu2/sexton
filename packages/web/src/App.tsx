// The site shell (spec clean-site, Architecture): the header, the Welcome bar, Home (or the Guide page), the site
// footer, the Tour and the Term Pop-over. The screen state of load/screen-state.ts, held by load/use-view.ts, is the
// one owner of what is open; every overlay renders from it. The loader follows the Source it names.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Term } from "./glossary/glossary.js";
import { TermPopover, type TermAnchor } from "./glossary/TermPopover.js";
import { GuidePage } from "./guide/GuidePage.js";
import { WelcomeBar } from "./guide/WelcomeBar.js";
import { closeWelcome, welcomeClosed } from "./guide/welcome-pref.js";
import { Header } from "./header/Header.js";
import { headerModel } from "./header/header-model.js";
import { scanTag } from "./header/scan-tag.js";
import { HomeView } from "./home/HomeView.js";
import { SiteFooter } from "./home/SiteFooter.js";
import { useMediaQuery } from "./hooks/use-media-query.js";
import { requestRemediation, type RemediateView } from "./load/remediate-client.js";
import { homeOf, type Popover } from "./load/screen-state.js";
import { DEMO_ADDRESS, useScanLoader } from "./load/use-scan-loader.js";
import { useView } from "./load/use-view.js";
import { HOME_VIEW, parseView, type View, type ViewSource } from "./load/view-address.js";
import { replayAddress, type ReplayId } from "./replay/replay-ids.js";
import { applyPalette, type Theme } from "./scene/palette.js";
import { Tour } from "./tour/Tour.js";

export interface AppProps {
  readonly fetchFn: typeof fetch;
  readonly apiBase: string | null;
  readonly initialSearch: string;
  readonly pageOrigin: string;
}

/** Pure. One key per thing a Source loads. */
function sourceKey(source: ViewSource): string {
  switch (source.kind) {
    case "replay":
      return `replay:${source.id}`;
    case "repo":
      return `repo:${source.url}`;
    case "scan":
      return `scan:${source.address}`;
    default:
      return source.kind;
  }
}

export function App({ fetchFn, apiBase, initialSearch, pageOrigin }: AppProps) {
  const loader = useScanLoader({ fetchFn, pageOrigin, apiBase, initialSearch });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const theme: Theme = "dark";
  const repoFieldRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    applyPalette(document.documentElement, theme);
  }, [theme]);
  // The page loads the Source its address names, as the loader does; the rest of the address joins in task 8.
  const [initial] = useState((): View => ({ ...HOME_VIEW, source: parseView(initialSearch, false).source }));
  const { state: screen, dispatch } = useView(initial);
  const loaded = useRef(sourceKey(initial.source));
  const { loadFrom, submitRepo } = loader;
  const loadSource = useCallback(
    (source: ViewSource): void => {
      loaded.current = sourceKey(source);
      switch (source.kind) {
        case "demo":
          loadFrom(DEMO_ADDRESS);
          return;
        case "replay":
          loadFrom(replayAddress(source.id), "replay");
          return;
        case "repo":
          submitRepo(source.url);
          return;
        case "scan":
          loadFrom(source.address);
          return;
        case "rejected":
          loadFrom("");
          return;
      }
    },
    [loadFrom, submitRepo],
  );
  /** Loads `source` unless it is the one already loaded. */
  const ensure = useCallback(
    (source: ViewSource): void => {
      if (sourceKey(source) !== loaded.current) loadSource(source);
    },
    [loadSource],
  );
  // The loader follows the Source the screen state names, whatever event changed it (Escape included).
  const shownSource = screen.view.source;
  useEffect(() => {
    ensure(shownSource);
  }, [shownSource, ensure]);
  const goHome = useCallback((): void => {
    ensure(homeOf(screen).source);
    dispatch({ kind: "home" });
  }, [ensure, screen, dispatch]);
  const openReplay = useCallback(
    (id: ReplayId): void => {
      dispatch({ kind: "open-replay", id });
      ensure({ kind: "replay", id });
    },
    [dispatch, ensure],
  );
  const scan = useCallback(
    (url: string): void => {
      const source: ViewSource = { kind: "repo", url };
      dispatch({ kind: "source", source });
      loadSource(source);
    },
    [dispatch, loadSource],
  );
  const [welcome, setWelcome] = useState(() => !welcomeClosed());
  const hideWelcome = useCallback((): void => {
    closeWelcome();
    setWelcome(false);
  }, []);
  const openGuide = useCallback((): void => {
    hideWelcome();
    dispatch({ kind: "open-guide" });
  }, [hideWelcome, dispatch]);
  const openTour = useCallback((): void => {
    ensure(homeOf(screen).source);
    dispatch({ kind: "open-tour" });
  }, [ensure, screen, dispatch]);
  const onPopover = useCallback(
    (popover: Popover): void => {
      dispatch(popover === "none" ? { kind: "close-popover" } : { kind: "open-popover", popover });
    },
    [dispatch],
  );
  const [term, setTerm] = useState<TermAnchor | null>(null);
  const onTerm = useCallback(
    (name: Term, anchor: HTMLButtonElement): void => {
      const r = anchor.getBoundingClientRect();
      setTerm({ term: name, left: r.left, top: r.top, bottom: r.bottom });
      dispatch({ kind: "open-popover", popover: "term" });
    },
    [dispatch],
  );

  // Escape (10.3): the Drawer handles its own and marks the event, so one press closes one thing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      dispatch({ kind: "escape" });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [dispatch]);
  // A press outside the open Pop-over closes it (11.5, 13.12).
  const popover = screen.popover;
  useEffect(() => {
    if (popover === "none") return undefined;
    const onPointer = (event: PointerEvent): void => {
      const root = document.querySelector(`[data-popover="${popover}"]`);
      if (root !== null && event.target instanceof Node && root.contains(event.target)) return;
      if (popover === "term" && event.target instanceof Element && event.target.closest(".term") !== null) return;
      dispatch({ kind: "close-popover" });
    };
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [popover, dispatch]);

  const { state } = loader;
  const model = useMemo(
    () => (state.status === "ready" ? headerModel(state.response, state.isDemo, state.source === "hosted" ? apiBase : null) : null),
    [state, apiBase],
  );
  // The button exists only for a hosted scan whose response says the repository is on the allowlist.
  const onRemediate = useMemo(() => {
    if (state.status !== "ready" || state.source !== "hosted" || apiBase === null || state.response.actions?.remediate !== true) return undefined;
    const repo = state.response.report.scan?.repo.url;
    if (repo === undefined) return undefined;
    return (packageName: string): Promise<RemediateView> => requestRemediation(fetchFn, apiBase, repo, packageName);
  }, [state, apiBase, fetchFn]);
  const source = screen.view.source;
  const scanning = state.status === "loading" && state.source === "hosted" && source.kind === "repo" ? scanTag(source) : null;
  const guide = screen.owner === "guide";
  return (
    <>
      <Header
        tag={scanTag(source)}
        theme={theme}
        apiConfigured={apiBase !== null}
        fieldRef={repoFieldRef}
        popover={screen.popover}
        onPopover={onPopover}
        onScan={scan}
        onHome={goHome}
        onGuide={openGuide}
        onTour={openTour}
      />
      {welcome && !guide ? <WelcomeBar onGuide={openGuide} onClose={hideWelcome} /> : null}
      {guide ? (
        <GuidePage
          onHome={goHome}
          onAttack={() => {
            openReplay("axios");
          }}
        />
      ) : (
        <main className="home-main">
          <HomeView
            key={state.loadId}
            load={state}
            screen={screen}
            dispatch={dispatch}
            theme={theme}
            reducedMotion={reducedMotion}
            repoFieldRef={repoFieldRef}
            scanning={scanning}
            onReplay={openReplay}
            onTerm={onTerm}
            {...(onRemediate !== undefined ? { onRemediate } : {})}
          />
        </main>
      )}
      {model !== null && !guide ? <SiteFooter model={model} /> : null}
      {screen.tourStep === null ? null : (
        <Tour
          step={screen.tourStep}
          apiConfigured={apiBase !== null}
          onNext={() => {
            dispatch({ kind: "tour-next" });
          }}
          onEnd={() => {
            dispatch({ kind: "close" });
          }}
        />
      )}
      {screen.popover === "term" && term !== null ? <TermPopover anchor={term} /> : null}
    </>
  );
}
