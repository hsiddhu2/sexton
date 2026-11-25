import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cemetery } from "./Cemetery.js";
import { LoadingCard } from "./LoadingCard.js";
import { Header } from "./header/Header.js";
import { headerModel } from "./header/header-model.js";
import { useMediaQuery } from "./hooks/use-media-query.js";
import { requestRemediation, type RemediateView } from "./load/remediate-client.js";
import { useScanLoader } from "./load/use-scan-loader.js";
import { replayAddress, type ReplayId } from "./replay/replay-ids.js";
import { applyPalette, type Theme } from "./scene/palette.js";
import { HISTORY_OMITTED_TEXT, Scrubber } from "./time/Scrubber.js";
import { ReplayButtons } from "./replay/ReplayButtons.js";
import { stopCards } from "./replay/stop-cards.js";
import { stopsFor } from "./time/stops.js";
import { usePlay } from "./time/use-play.js";
import { browserStorage, readSerious, writeSerious } from "./epitaph/serious.js";
import { useSound } from "./sound/use-sound.js";
import { fixFirst } from "./header/fix-first.js";
import { Guide, type GuideStepIndex } from "./guide/Guide.js";
import { guideMayOpenByItself, readGuideClosed, writeGuideClosed } from "./guide/guide-pref.js";
import type { AnchorId } from "./guide/guide-steps.js";
import { REPLAY_BUTTON_TEXT } from "./replay/replay-ids.js";
import type { Rect } from "./scene/layout.js";

const NO_STOPS: readonly number[] = [];
const NO_LABELS: readonly Rect[] = [];

/** The control a Guide step points at: the Fix-first grave's button, or the "axios, Mar 2026" Replay button. */
function guideAnchor(id: AnchorId): HTMLElement | null {
  if (id === "fix-first-grave") return document.querySelector<HTMLElement>('button[data-grave-index="0"]');
  for (const b of document.querySelectorAll<HTMLElement>(".night-footer .replay-button")) if (b.textContent === REPLAY_BUTTON_TEXT.axios) return b;
  return null;
}

interface GuideState {
  readonly open: boolean;
  readonly step: GuideStepIndex;
}

export interface AppProps {
  readonly fetchFn: typeof fetch;
  readonly apiBase: string | null;
  readonly initialSearch: string;
  readonly pageOrigin: string;
}

export function App({ fetchFn, apiBase, initialSearch, pageOrigin }: AppProps) {
  const loader = useScanLoader({ fetchFn, pageOrigin, apiBase, initialSearch });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // Serious mode, remembered per browser with a guarded read (spec cemetery-undead, 8).
  const [serious, setSerious] = useState(() => readSerious(browserStorage()));
  const toggleSerious = useCallback((): void => {
    const next = !serious;
    writeSerious(browserStorage(), next);
    setSerious(next);
  }, [serious]);
  // Sound, off by default; no AudioContext before it is on and a gesture has happened (spec cemetery-undead-2, 8).
  const sound = useSound({ serious });
  const soundToggle = useMemo(() => ({ on: sound.on, onToggle: sound.toggle }), [sound.on, sound.toggle]);
  const theme: Theme = "dark";
  const repoFieldRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    applyPalette(document.documentElement, theme);
  }, [theme]);
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
  const onReplay = useCallback(
    (id: ReplayId): void => {
      loader.loadFrom(replayAddress(id), "replay");
    },
    [loader],
  );
  const stopInfo = useMemo(() => (state.status === "ready" ? stopsFor(state.response) : null), [state]);
  const scrubberRef = useRef<HTMLInputElement | null>(null);
  // The chosen Stop belongs to one load. A replay opens at its first Stop, every other response at its Scan date
  // (spec cemetery-time-fixes, requirement 3). A slider move, Back to now and a new load stop Play.
  const isReplay = state.status === "ready" && state.response.replay !== undefined;
  // Fix first (spec judge-path, requirement 2): a press bumps the request, and the cemetery selects and focuses it.
  const fixFirstValue = useMemo(() => (state.status === "ready" ? fixFirst(state.response) : null), [state]);
  const [selectRequest, setSelectRequest] = useState(0);
  const fixFirstProp = useMemo(
    () =>
      fixFirstValue === null
        ? undefined
        : {
            value: fixFirstValue,
            onPress: () => {
              setSelectRequest((n) => n + 1);
            },
          },
    [fixFirstValue],
  );
  // The Guide (spec judge-path, requirement 1): opens by itself once, on the Demo, unless this browser closed it.
  const [guide, setGuide] = useState<GuideState>({ open: false, step: 0 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [guideFocus, setGuideFocus] = useState(0);
  const guideButtonRef = useRef<HTMLButtonElement | null>(null);
  const labelsRef = useRef<(() => readonly Rect[]) | null>(null);
  const autoOpened = useRef(false);
  const readyDemo = state.status === "ready" && state.isDemo && state.response.replay === undefined;
  useEffect(() => {
    if (!readyDemo || autoOpened.current) return;
    autoOpened.current = true;
    if (!guideMayOpenByItself() || readGuideClosed(browserStorage())) return;
    setGuide({ open: true, step: 0 });
  }, [readyDemo]);
  const openGuide = useCallback((): void => {
    setGuide({ open: true, step: 0 });
    setGuideFocus((n) => n + 1);
  }, []);
  const closeGuide = useCallback((): void => {
    writeGuideClosed(browserStorage());
    setGuide((g) => ({ ...g, open: false }));
    // A focus request is spent once the Guide unmounts, so a later mount never takes focus by itself (review).
    setGuideFocus(0);
  }, []);
  const stepGuide = useCallback((step: GuideStepIndex): void => {
    setGuide((g) => ({ ...g, step }));
  }, []);
  const onDrawer = useCallback((open: boolean): void => {
    setDrawerOpen(open);
    // The Guide unmounts while the drawer is open; when it comes back the drawer's focus return must stand (review).
    if (open) setGuideFocus(0);
    // The drawer holds step 3's evidence and pull request preview: opening it moves the Guide on to that step (1.19).
    if (open) setGuide((g) => (g.open && g.step < 2 ? { ...g, step: 2 } : g));
  }, []);
  // The names, and the speech Bubbles over the scene: the Guide's card covers neither.
  const readLabels = useCallback((): readonly Rect[] => {
    const bubbles = [...document.querySelectorAll<HTMLElement>(".bubble-layer p")].map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    return [...(labelsRef.current?.() ?? NO_LABELS), ...bubbles];
  }, []);
  const guideProp =
    state.status !== "ready"
      ? undefined
      : {
          onOpen: openGuide,
          buttonRef: guideButtonRef,
          panel:
            guide.open && !drawerOpen ? (
              <Guide
                step={guide.step}
                onStep={stepGuide}
                onClose={closeGuide}
                reducedMotion={reducedMotion}
                focusRequest={guideFocus}
                anchorFor={guideAnchor}
                labels={readLabels}
                returnFocusTo={guideButtonRef}
              />
            ) : null,
        };
  const player = usePlay(stopInfo?.stops ?? NO_STOPS, state.loadId, isReplay);
  const { index, seek } = player;
  const last = stopInfo === null ? 0 : stopInfo.stops.length - 1;
  const showScrubber = stopInfo !== null && stopInfo.hasTimelines;
  const cards = useMemo(() => (state.status === "ready" && stopInfo !== null ? stopCards(state.response, stopInfo.stops) : null), [state, stopInfo]);
  const asOfMs = showScrubber ? (stopInfo.stops[index] ?? null) : null;
  const asOf = showScrubber && index < last && asOfMs !== null
    ? {
        iso: new Date(asOfMs).toISOString(),
        onBack: () => {
          seek(last);
          scrubberRef.current?.focus();
        },
      }
    : undefined;
  return (
    <>
      <Header model={model} theme={theme} apiConfigured={apiBase !== null} onSubmit={loader.submitRepo} fieldRef={repoFieldRef} serious={serious} onSerious={toggleSerious} replay={isReplay} sound={soundToggle} {...(asOf !== undefined ? { asOf } : {})} {...(fixFirstProp !== undefined ? { fixFirst: fixFirstProp } : {})} {...(guideProp !== undefined ? { guide: guideProp } : {})} />
      {state.status === "loading" ? (
        <LoadingCard />
      ) : state.status === "error" ? (
        <main className="panel-main">
          <section role="alert" className="load-error">
            <h2>Scan could not be loaded</h2>
            <p>
              <code>{state.error.code}</code>: {state.error.message}
            </p>
            {state.error.contractErrors === undefined ? null : (
              <ul>
                {state.error.contractErrors.map((e, i) => (
                  <li key={i}>
                    {e.path} {e.code} {e.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      ) : (
        <Cemetery
          key={state.loadId}
          response={state.response}
          theme={theme}
          reducedMotion={reducedMotion}
          asOfMs={asOfMs}
          repoFieldRef={repoFieldRef}
          serious={serious}
          play={sound.play}
          selectRequest={selectRequest}
          onDrawer={onDrawer}
          labelsRef={labelsRef}
          {...(onRemediate !== undefined ? { onRemediate } : {})}
        />
      )}
      <footer className="night-footer">
        {showScrubber ? (
          <Scrubber
            stops={stopInfo.stops}
            index={index}
            onChange={seek}
            inputRef={scrubberRef}
            playing={player.playing}
            onPlay={player.play}
            onPause={player.pause}
            announce={player.announce}
            cards={cards}
          />
        ) : state.status === "ready" && state.response.timelinesOmitted === "too-large" ? (
          <p className="history-omitted">{HISTORY_OMITTED_TEXT}</p>
        ) : null}
        <ReplayButtons onReplay={onReplay} />
      </footer>
    </>
  );
}
