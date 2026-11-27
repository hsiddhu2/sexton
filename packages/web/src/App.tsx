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
import { freshResponse, repoKey, type Entry } from "./cache/scan-cache.js";
import { clearCache, readCache, saveScan } from "./cache/scan-store.js";
import type { Navigate } from "./site/Root.js";
import { TRACK } from "./music/track.js";
import { useMusic } from "./music/use-music.js";

export interface AppProps {
  readonly fetchFn: typeof fetch;
  readonly apiBase: string | null;
  readonly initialSearch: string;
  readonly pageOrigin: string;
  /** Moves to another Route (spec home-page, C2): the wordmark goes to "/" through it. */
  readonly onNavigate?: Navigate;
  /** True when a press on the Home page or a Recent scans row started this Live scan (spec home-page, 3.3). */
  readonly startScan?: boolean;
  /** The clock of the scan cache. */
  readonly now?: () => number;
}

/** A Live scan response held in this page, with the time it was saved when it came from the scan cache. */
interface Held {
  readonly response: ScanResponse;
  readonly savedAt: number | null;
}

/** Pure. The Repo key of a repository URL, or null when it is not a repository link (spec home-page, 13.1). */
function keyOf(url: string): { readonly key: string; readonly label: string } | null {
  const repo = normaliseRepo(url);
  return repo.ok ? { key: repoKey(repo.label), label: repo.label } : null;
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

export function App({ fetchFn, apiBase, initialSearch, pageOrigin, onNavigate, startScan = false, now = Date.now }: AppProps) {
  const hosted = apiBase !== null;
  // The page shows the View its address names (10.6); a repository waits for a press unless this is a reload after
  // the visitor's own scan (10.11, 10.12).
  const [initial] = useState((): View => parseView(initialSearch, hosted));
  // A Fresh Entry of the scan cache shows with no request (spec home-page, 13.2).
  const [initialHeld] = useState((): Held | null => {
    if (initial.source.kind !== "repo") return null;
    const id = keyOf(initial.source.url);
    const fresh = id === null ? null : freshResponse(readCache(), id.key, now());
    return fresh === null ? null : { response: fresh.response, savedAt: fresh.savedAt };
  });
  const [resume] = useState(
    () =>
      initialHeld === null &&
      initial.source.kind === "repo" &&
      (startScan || mayResume(initial.source.url, readScanned(sessionStore()), isReload())),
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
  const held = useRef(
    new Map<string, Held>(initialHeld !== null && initial.source.kind === "repo" ? [[initial.source.url, initialHeld]] : []),
  );
  /** The repository whose request is running, so its response is saved to the scan cache when it arrives (13.1). */
  const pendingSave = useRef<string | null>(null);
  /** When the Live scan on screen came from the scan cache: its repository and save time (13.3). */
  const [cached, setCached] = useState<{ readonly url: string; readonly savedAt: number } | null>(null);
  const [recent, setRecent] = useState<readonly Entry[]>(readCache);
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
          pendingSave.current = source.url;
          setCached(null);
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
      const kept = held.current.get(source.url);
      if (kept !== undefined) {
        // Showing a held response aborts any request in flight, whose response must then not be saved (13.1).
        pendingSave.current = null;
        markLoaded(key);
        setCached(kept.savedAt === null ? null : { url: source.url, savedAt: kept.savedAt });
        show(kept.response, "hosted");
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
    if (state.status === "error") pendingSave.current = null;
    if (state.status !== "ready" || state.source !== "hosted" || !loaded.current.startsWith("repo:")) return;
    const url = loaded.current.slice(5);
    if (pendingSave.current !== url) return;
    // A response that arrived from a request: kept for Back and Forward and saved to the scan cache (13.1).
    pendingSave.current = null;
    const savedAt = now();
    held.current.set(url, { response: state.response, savedAt });
    const id = keyOf(url);
    if (id !== null) setRecent(saveScan(id.label, state.response, savedAt));
  }, [state, now]);
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
      // A Fresh Entry shows with no request (13.2); else the scan starts.
      const id = keyOf(url);
      const fresh = id === null ? null : freshResponse(readCache(), id.key, now());
      if (fresh === null) {
        loadSource(source);
        return;
      }
      held.current.set(url, { response: fresh.response, savedAt: fresh.savedAt });
      // Showing the saved response aborts any request in flight, whose response must then not be saved (13.1).
      pendingSave.current = null;
      markLoaded(sourceKey(source));
      setCached({ url, savedAt: fresh.savedAt });
      show(fresh.response, "hosted");
    },
    [dispatch, loadSource, markLoaded, show, now],
  );
  // Rescan (13.4): one request for the repository on screen, whatever the cache holds.
  const rescan = useCallback((): void => {
    const source = screenRef.current.view.source;
    if (source.kind === "repo") loadSource(source);
  }, [loadSource]);
  const refreshRecent = useCallback((): void => {
    setRecent(readCache());
  }, []);
  const clearRecent = useCallback((): void => {
    clearCache();
    setRecent([]);
  }, []);
  const toHomePage = useMemo(
    () =>
      onNavigate === undefined
        ? undefined
        : (): void => {
            onNavigate("/");
          },
    [onNavigate],
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
  // The Track slot (14): Music starts off, with no audio element and the normal idle motion until it is pressed.
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
  // The cached line shows while the saved response of the Live scan on screen is shown (13.3).
  const cachedShown =
    cached !== null && source.kind === "repo" && source.url === cached.url && state.status === "ready" && loadedKey === sourceKey(source) ? cached : null;
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
        {...(toHomePage !== undefined ? { onWordmark: toHomePage } : {})}
        onCemetery={goHome}
        recent={recent}
        now={now}
        onRecentOpen={refreshRecent}
        onClearRecent={clearRecent}
        onGuide={openGuide}
        onTour={openTour}
        {...(TRACK !== null ? { music: { on: music.on, onToggle: music.toggle } } : {})}
      />
      {welcome && !guide ? <WelcomeBar onGuide={openGuide} onClose={hideWelcome} /> : null}
      {guide ? (
        <GuidePage
          theme={theme}
          track={TRACK}
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
            {...(cachedShown !== null ? { cached: { savedAt: cachedShown.savedAt, now, onRescan: rescan } } : {})}
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
