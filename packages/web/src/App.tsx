// The site shell (spec clean-site, Architecture): the header, the Welcome bar, Home (or a Replay, or the Guide page), the site
// footer, the Tour and the Term Pop-over. The screen state of load/screen-state.ts, held by load/use-view.ts, is the
// one owner of what is open; every overlay renders from it. The loader follows the Source it names.
import type { ScanResponse } from "@sexton/api";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Term } from "./glossary/glossary.js";
import { TermPopover, type TermAnchor } from "./glossary/TermPopover.js";
import { GuidePage } from "./guide/GuidePage.js";
import { WelcomeBar } from "./guide/WelcomeBar.js";
import { closeWelcome, welcomeClosed } from "./guide/welcome-pref.js";
import type { ScanKind } from "./drawer/fix-view.js";
import { Header } from "./header/Header.js";
import { headerModel } from "./header/header-model.js";
import { scanTag } from "./header/scan-tag.js";
import { DEMO_REPO } from "./header/examples.js";
import { normaliseRepo } from "./header/repo-input.js";
import { HomeView } from "./home/HomeView.js";
import { SiteFooter } from "./home/SiteFooter.js";
import { useMediaQuery } from "./hooks/use-media-query.js";
import { requestRemediation, type RemediateView } from "./load/remediate-client.js";
import { homeOf, type Popover } from "./load/screen-state.js";
import { DEMO_ADDRESS, useScanLoader } from "./load/use-scan-loader.js";
import { useView } from "./load/use-view.js";
import { isReload, mayResume, readScanned, sessionStore, writeScanned } from "./load/scanned-pref.js";
import { formatView, HOME_VIEW, parseView, type View, type ViewSource } from "./load/view-address.js";
import { replayAddress, type ReplayId } from "./replay/replay-ids.js";
import { ReplayView } from "./replay/ReplayView.js";
import { applyPalette, type Theme } from "./scene/palette.js";
import { Tour } from "./tour/Tour.js";
import { TRACK } from "./music/track.js";
import { useMusic } from "./music/use-music.js";

export interface AppProps {
  readonly fetchFn: typeof fetch;
  readonly apiBase: string | null;
  readonly initialSearch: string;
  readonly pageOrigin: string;
}

/** The tag and the Home scan the page showed last; `home` is null until a scan (not a replay) has shown. */
interface ShownScan {
  readonly loadId: number;
  readonly tag: string | null;
  readonly home: { readonly response: ScanResponse; readonly loadId: number; readonly isDemo: boolean; readonly hosted: boolean; readonly tag: string | null } | null;
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

/** Pure. What the loader reads first: the Source of the address, with a repository left to the App (10.11, 10.12). */
function loaderSearch(view: View): string {
  const source = view.source;
  return source.kind === "repo" || source.kind === "demo" ? "" : formatView({ ...HOME_VIEW, source });
}

export function App({ fetchFn, apiBase, initialSearch, pageOrigin }: AppProps) {
  const hosted = apiBase !== null;
  // The page shows the View its address names (10.6); a repository waits for a press unless this is a reload after
  // the visitor's own scan (10.11, 10.12).
  const [initial] = useState((): View => parseView(initialSearch, hosted));
  const [resume] = useState(
    () => initial.source.kind === "repo" && mayResume(initial.source.url, readScanned(sessionStore()), isReload()),
  );
  const loader = useScanLoader({ fetchFn, pageOrigin, apiBase, initialSearch: loaderSearch(initial) });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const theme: Theme = "dark";
  const repoFieldRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    applyPalette(document.documentElement, theme);
  }, [theme]);
  const { state: screen, dispatch } = useView(initial, { hosted });
  // What the loader shows. A repository that waits for a press shows the Sample scan under its prompt.
  const firstKey = initial.source.kind === "repo" ? sourceKey({ kind: "demo" }) : sourceKey(initial.source);
  const loaded = useRef(firstKey);
  const [loadedKey, setLoadedKey] = useState(firstKey);
  const markLoaded = useCallback((key: string): void => {
    loaded.current = key;
    setLoadedKey(key);
  }, []);
  // The responses of Live scans shown in this page, so Back and Forward show them again with no request.
  const held = useRef(new Map<string, ScanResponse>());
  const { loadFrom, submitRepo, show } = loader;
  const loadSource = useCallback(
    (source: ViewSource): void => {
      markLoaded(sourceKey(source));
      switch (source.kind) {
        case "demo":
          loadFrom(DEMO_ADDRESS);
          return;
        case "replay":
          loadFrom(replayAddress(source.id), "replay");
          return;
        case "repo":
          writeScanned(sessionStore(), source.url);
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
    [loadFrom, submitRepo, markLoaded],
  );
  /**
   * Shows `source` unless it is the one already loaded. A repository is never scanned here: a held response shows
   * again, else its prompt shows over the Sample scan (10.11).
   */
  const ensure = useCallback(
    (source: ViewSource): void => {
      const key = sourceKey(source);
      if (key === loaded.current) return;
      if (source.kind !== "repo") {
        loadSource(source);
        return;
      }
      const response = held.current.get(source.url);
      if (response !== undefined) {
        markLoaded(key);
        show(response, "hosted");
        return;
      }
      if (loaded.current !== sourceKey({ kind: "demo" })) loadSource({ kind: "demo" });
    },
    [loadSource, markLoaded, show],
  );
  // A reload after the visitor's own scan starts it again (10.12).
  useEffect(() => {
    if (resume) loadSource(initial.source);
    // Runs once per mount: the first address is read a single time.
  }, []);
  const { state } = loader;
  useEffect(() => {
    if (state.status === "ready" && state.source === "hosted" && loaded.current.startsWith("repo:")) held.current.set(loaded.current.slice(5), state.response);
  }, [state]);
  // The loader follows the Source the screen state names, whatever event changed it (Escape and Back included).
  const shownSource = screen.view.source;
  useEffect(() => {
    ensure(shownSource);
  }, [shownSource, ensure]);
  /** The repository waiting for a press, or null (10.11). */
  const prompt = shownSource.kind === "repo" && loadedKey !== sourceKey(shownSource) ? shownSource.url : null;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  // The Home action (10.2). A prompt is not a scan, so from it or from a view opened over it Home is the Sample scan.
  const goHome = useCallback((): void => {
    const home = homeOf(screenRef.current).source;
    if (home.kind === "repo" && home.url === promptRef.current) dispatch({ kind: "source", source: { kind: "demo" } });
    else dispatch({ kind: "home" });
  }, [dispatch]);
  const openReplay = useCallback(
    (id: ReplayId): void => {
      dispatch({ kind: "open-replay", id });
    },
    [dispatch],
  );
  const scan = useCallback(
    (url: string): void => {
      const source: ViewSource = { kind: "repo", url };
      dispatch({ kind: "source", source });
      loadSource(source);
    },
    [dispatch, loadSource],
  );
  // The failure cards' buttons (12.5 to 12.7) and the unknown replay's "Back to the cemetery" (10.10). Each loads even
  // when its Source is the one that just failed.
  const sample = useCallback((): void => {
    const source: ViewSource = { kind: "demo" };
    dispatch({ kind: "source", source });
    loadSource(source);
  }, [dispatch, loadSource]);
  const demoRepo = useCallback((): void => {
    // "Try the demo repo" (12.5): a Live scan of the demo repository, through the Scan field's own normalising.
    const demo = normaliseRepo(DEMO_REPO);
    if (demo.ok) scan(demo.url);
  }, [scan]);
  const shown = screen.view.source;
  const retry = useCallback((): void => {
    loadSource(shown);
  }, [loadSource, shown]);
  // The Track slot (14): no track, no button, no audio element and the normal idle motion.
  const music = useMusic(TRACK);
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
    dispatch({ kind: "open-tour" });
  }, [dispatch]);
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

  // Escape (10.3): a Pop-over, else the Tour, else the Drawer, else a Replay or the Guide page goes home. The Drawer
  // handles its own and marks the event, so one press closes one thing; its last step is the Home action of goHome.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const s = screenRef.current;
      if (s.popover === "none" && (s.owner === "replay" || s.owner === "guide")) goHome();
      else dispatch({ kind: "escape" });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [dispatch, goHome]);
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
  // The fix tab's notes follow the kind of scan (7.13 to 7.15); a scan file counts as a Live scan without actions.
  const scanKind: ScanKind = state.status !== "ready" ? "live" : state.isDemo ? "sample" : onRemediate !== undefined ? "live-remediate" : "live";
  const source = screen.view.source;
  const scanning = state.status === "loading" && state.source === "hosted" && source.kind === "repo" ? scanTag(source) : null;
  const guide = screen.owner === "guide";
  // What the page showed last (review against the approved design): the tag and the Home scan of the last load that
  // finished for the Source on screen. While a load runs or after it fails, the tag keeps the old text (a Live scan's
  // name shows only once its scan is in) and Home keeps the old page under the card.
  const tagNow = scanTag(prompt === null ? source : { kind: "demo" });
  const shownLast = useRef<ShownScan | null>(null);
  if (state.status === "ready" && (prompt !== null || loadedKey === sourceKey(source))) {
    const before = shownLast.current;
    if (before?.loadId !== state.loadId || before.tag !== tagNow) {
      const home = state.source === "replay" ? (before?.home ?? null) : { response: state.response, loadId: state.loadId, isDemo: state.isDemo, hosted: state.source === "hosted", tag: tagNow };
      shownLast.current = { loadId: state.loadId, tag: tagNow, home };
    }
  }
  const last = state.status === "ready" ? null : shownLast.current;
  const previous = last?.home ?? null;
  // The tag goes with the page under the card: a Replay names itself, and Home keeps the tag of the scan it still
  // shows, not of a Replay seen in between.
  const tag = last === null || source.kind === "replay" ? tagNow : (previous?.tag ?? tagNow);
  const footerModel = useMemo(
    () => model ?? (previous === null ? null : headerModel(previous.response, previous.isDemo, previous.hosted ? apiBase : null)),
    [model, previous, apiBase],
  );
  return (
    <>
      <Header
        tag={tag}
        prompt={prompt}
        theme={theme}
        apiConfigured={apiBase !== null}
        fieldRef={repoFieldRef}
        popover={screen.popover}
        onPopover={onPopover}
        onScan={scan}
        onHome={goHome}
        onGuide={openGuide}
        onTour={openTour}
        {...(TRACK !== null ? { music: { on: music.on, onToggle: music.toggle } } : {})}
      />
      {welcome && !guide ? <WelcomeBar onGuide={openGuide} onClose={hideWelcome} /> : null}
      {guide ? (
        <GuidePage
          theme={theme}
          onTerm={onTerm}
          onHome={goHome}
          onAttack={() => {
            openReplay("axios");
          }}
        />
      ) : source.kind === "replay" && screen.owner === "replay" ? (
        <main className="home-main">
          <ReplayView
            id={source.id}
            load={state}
            theme={theme}
            reducedMotion={reducedMotion}
            repoFieldRef={repoFieldRef}
            onHome={goHome}
            onTerm={onTerm}
            onRetry={retry}
            onSample={sample}
            beat={music.beat}
          />
        </main>
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
            previous={previous}
            live={source.kind === "repo" && prompt === null}
            current={loadedKey === sourceKey(source)}
            onReplay={openReplay}
            onTerm={onTerm}
            scanKind={scanKind}
            onGuide={openGuide}
            onDemoRepo={demoRepo}
            onSample={sample}
            onRetry={retry}
            beat={music.beat}
            {...(onRemediate !== undefined ? { onRemediate } : {})}
          />
        </main>
      )}
      {footerModel !== null && !guide && !(source.kind === "replay" && screen.owner === "replay" && model === null) ? <SiteFooter model={footerModel} track={TRACK} /> : null}
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
