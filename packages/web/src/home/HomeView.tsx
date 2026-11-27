// Home (spec clean-site, design C3 and the Architecture): the headline, notices, chips and the Graveyard / List
// switch; the Scene card with the help line and date badge; the Footer bar; and the Panel. A Replay has its own view
// (replay/ReplayView.tsx). Components only render and route events; the rules are in the pure modules they call.
import type { PackageHealth, ScanResponse, State } from "@sexton/api";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Cemetery } from "../Cemetery.js";
import { LoadingCard, LoadingStatus } from "../LoadingCard.js";
import { DRY_LINES } from "../copy/mischief.js";
import { LOAD_FAILED_CARD, liveFailureCard, NO_SUCH_REPLAY_TEXT } from "../load/scan-failure.js";
import { BACK_TO_CEMETERY, BACK_TO_SAMPLE, FailureCard, TRY_AGAIN, TRY_DEMO_REPO } from "./FailureCard.js";
import type { Term } from "../glossary/glossary.js";
import { dayText } from "../header/format-scan-time.js";
import type { ScanKind } from "../drawer/fix-view.js";
import type { Beat } from "../scene/motion.js";
import type { LoadError } from "../load/load-error.js";
import type { RemediateView } from "../load/remediate-client.js";
import type { ScreenState } from "../load/screen-state.js";
import type { Dispatch } from "../load/use-view.js";
import type { LoadState } from "../load/use-scan-loader.js";
import { STATES } from "../load/lists.js";
import { FixOrder } from "../panel/FixOrder.js";
import { fixOrder, plansByName } from "../panel/fix-order.js";
import { Inspector } from "../panel/Inspector.js";
import type { ReplayId } from "../replay/replay-ids.js";
import { hasGhost, type Theme } from "../scene/layout.js";
import { overlayRects } from "../scene/overlay-band.js";
import { stepWrap } from "../selection/selection.js";
import { HISTORY_OMITTED_TEXT, Scrubber } from "../time/Scrubber.js";
import { formAt, timelineOf, type FormView } from "../time/form-at.js";
import { stopsFor } from "../time/stops.js";
import { triageOrder } from "../triage/triage.js";
import { AttackPicker } from "./AttackPicker.js";
import { countsAt, headline } from "./headline.js";
import { ListView } from "./ListView.js";
import { notices } from "./notices.js";
import { ScanningCard } from "./ScanningCard.js";
import { useReserve } from "./use-reserve.js";
import { usePanelScroll } from "../panel/use-panel-scroll.js";

export const HELP_LINE = "Point at a grave to see its details on the right. Click it to open.";
export const BACK_TO_NOW = "Back to now";
const NO_STOPS: readonly number[] = [];

export interface HomeViewProps {
  readonly load: LoadState;
  readonly screen: ScreenState;
  readonly dispatch: Dispatch;
  readonly theme: Theme;
  readonly reducedMotion: boolean;
  readonly repoFieldRef: RefObject<HTMLInputElement | null>;
  /** The repository as owner/name while a Live scan loads, for the scanning card (1.14); else null. */
  readonly scanning: string | null;
  /** True while a Live scan is shown, so a failed load shows the Live scan's card (12.2). */
  readonly live?: boolean;
  /**
   * True when the loaded response is the one the screen state's Source names. After Back or Forward the old response
   * may show for a moment; a grave or date is checked against the scan only once its own response is in (10.9).
   */
  readonly current?: boolean;
  readonly onRemediate?: (packageName: string) => Promise<RemediateView>;
  readonly onReplay: (id: ReplayId) => void;
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
  /** The kind of scan, for the Drawer's fix tab (7.13 to 7.15). */
  readonly scanKind?: ScanKind;
  /** Opens the Guide page (the fix tab's "How does this work?"). */
  readonly onGuide?: () => void;
  /** The failure cards' buttons (12.1, 12.5 to 12.7): a Live scan of the demo repo, the Sample scan, the same load again. */
  readonly onDemoRepo?: () => void;
  readonly onSample?: () => void;
  readonly onRetry?: () => void;
  /** The music beat while Music is on (14.3). */
  readonly beat?: Beat | null;
  /**
   * The Home scan shown before this load, or null. While a load runs or after it fails, its page stays under the
   * scanning or failure card, over a dimmed Scene, as in the approved design.
   */
  readonly previous?: PreviousScan | null;
}

/** A scan Home showed before the current load. */
export interface PreviousScan {
  readonly response: ScanResponse;
  readonly loadId: number;
}

const none = (): void => undefined;

export function HomeView(props: HomeViewProps) {
  const { load, previous = null } = props;
  if (load.status === "ready") return <ReadyHome {...props} response={load.response} loadId={load.loadId} />;
  const card =
    load.status === "loading" ? (
      props.scanning !== null ? (
        <ScanningCard label={props.scanning} />
      ) : (
        <LoadingCard />
      )
    ) : (
      <LoadFailure {...props} error={load.error} />
    );
  // The page of the scan shown before stays, inert, under the card; the card sits over its dimmed Scene.
  if (previous !== null) {
    const veil =
      load.status === "loading" && props.scanning === null ? (
        <div className="scene-card-overlay">
          <LoadingStatus />
        </div>
      ) : (
        card
      );
    return <ReadyHome {...props} response={previous.response} loadId={previous.loadId} current={false} veil={veil} />;
  }
  return (
    <div className="home">
      <section className="home-left">
        <div className="scene-card scene-card-waiting">{card}</div>
      </section>
    </div>
  );
}

/**
 * The failure card of a failed load (12.1, 12.2, 12.7): from the HTTP status and API code for a Live scan, with "Try
 * the demo repo" and "Back to the sample"; the fixed load card otherwise, with "Try again" and "Back to the sample".
 * No other text of the error is shown (12.4).
 */
function LoadFailure({ screen, live, error, onDemoRepo, onSample, onRetry }: HomeViewProps & { readonly error: LoadError }) {
  // A replay value outside the closed set loads nothing (10.10); its one button loads the Sample scan.
  if (screen.view.source.kind === "rejected") return <FailureCard dry={DRY_LINES["no-such-replay"]} sentence={NO_SUCH_REPLAY_TEXT} actions={[{ label: BACK_TO_CEMETERY, onPress: onSample ?? none }]} />;
  const sample = { label: BACK_TO_SAMPLE, onPress: onSample ?? none };
  if (live === true) {
    const card = liveFailureCard(error);
    return <FailureCard dry={DRY_LINES[card.id]} sentence={card.sentence} next={card.next} actions={[{ label: TRY_DEMO_REPO, onPress: onDemoRepo ?? none }, sample]} />;
  }
  return <FailureCard dry={DRY_LINES["load-failed"]} sentence={LOAD_FAILED_CARD.sentence} next={LOAD_FAILED_CARD.next} actions={[{ label: TRY_AGAIN, onPress: onRetry ?? none }, sample]} />;
}

interface ReadyProps extends HomeViewProps {
  readonly response: ScanResponse;
  readonly loadId: number;
  /** The scanning or failure card over the dimmed Scene of the scan shown before; the page under it is inert. */
  readonly veil?: ReactNode;
}

/** The scan Form of a package and its Form at an instant, from its Segments; never a state rule. */
function formOf(response: ScanResponse, pkg: PackageHealth, atMs: number | null): FormView {
  const scanForm: FormView = { state: pkg.state, reason: pkg.stateReason, ghost: hasGhost(pkg) };
  return atMs === null ? scanForm : formAt(timelineOf(response, pkg.name), atMs, scanForm);
}

function ReadyHome({ response, loadId, screen, current = true, dispatch, theme, reducedMotion, repoFieldRef, onRemediate, onReplay, onTerm, scanKind, onGuide, beat, veil }: ReadyProps) {
  const veiled = veil !== undefined;
  const order = useMemo(() => triageOrder(response.report.packages), [response]);
  const indexOf = useMemo(() => new Map(order.map((p, i) => [p.name, i])), [order]);
  // The date, from the screen state (view.at).
  const stopInfo = useMemo(() => stopsFor(response), [response]);
  const stops = stopInfo.hasTimelines ? stopInfo.stops : NO_STOPS;
  const last = stops.length - 1;
  const atIso = screen.view.at;
  const homeIndex = useMemo(() => {
    if (atIso === null) return last;
    const i = stops.indexOf(Date.parse(atIso));
    return i === -1 ? last : i;
  }, [atIso, stops, last]);
  const index = homeIndex;
  // A grave or date the loaded scan does not have leaves the address with a replace, and the rest shows (10.9).
  const grave = screen.view.grave;
  const badGrave = current && grave !== null && !indexOf.has(grave);
  const badDate = current && atIso !== null && (stops.indexOf(Date.parse(atIso)) === -1 || stops.indexOf(Date.parse(atIso)) === last);
  useEffect(() => {
    if (badGrave) dispatch({ kind: "close" }, "replace");
    if (badDate) dispatch({ kind: "date", at: null }, "replace");
  }, [badGrave, badDate, dispatch]);
  const showScrubber = stopInfo.hasTimelines;
  const asOfMs = showScrubber ? (stops[index] ?? null) : null;
  const earlier = showScrubber && index < last && asOfMs !== null;
  const shownMs = earlier ? asOfMs : null;
  const date = shownMs === null ? null : dayText(shownMs);
  const scrubberRef = useRef<HTMLInputElement | null>(null);
  const onDate = useCallback(
    (i: number): void => {
      const ms = stops[i];
      dispatch({ kind: "date", at: i >= last || ms === undefined ? null : new Date(ms).toISOString() });
    },
    [stops, last, dispatch],
  );
  const onBackToNow = (): void => {
    onDate(last);
    scrubberRef.current?.focus();
  };

  // The Selected grave, and the graves under the pointer and holding focus (3.3 to 3.5).
  // At load the Selected grave is the one whose Drawer the address opens, else the first in triage order.
  const [selected, setSelected] = useState<number | null>(() => (grave !== null ? indexOf.get(grave) : undefined) ?? (order.length > 0 ? 0 : null));
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const onLook = useCallback((h: number | null, f: number | null): void => {
    setHover(h);
    setFocus(f);
  }, []);
  const looked = hover ?? focus ?? selected;
  const lookedPkg = looked === null ? undefined : order[looked];

  const drawerOpen = !veiled && screen.owner === "drawer" && !badGrave;
  const still = drawerOpen || veiled;
  const openDrawer = useCallback(
    (name: string): void => {
      if (indexOf.has(name)) dispatch({ kind: "open-drawer", grave: name });
    },
    [indexOf, dispatch],
  );
  const closeDrawer = useCallback((): void => {
    dispatch({ kind: "close" });
  }, [dispatch]);
  const pick = useCallback(
    (name: string): void => {
      const i = indexOf.get(name);
      if (i !== undefined) setSelected(i);
    },
    [indexOf],
  );
  // A List row opens its Drawer and becomes the Selected grave, as a grave press does (6.9, 6.10, 6.13).
  const openFromList = useCallback(
    (name: string): void => {
      pick(name);
      openDrawer(name);
    },
    [pick, openDrawer],
  );

  // Left, Right and Enter (3.23, 3.24): only with focus on the body, a grave button or a Fix order row, and with no
  // View owner or Pop-over open, so the scrubber, the fields and the Drawer keep their own keys.
  const keysActive = !veiled && screen.owner === "none" && screen.popover === "none";
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    if (!keysActive) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = document.activeElement;
      const onBody = target === null || target === document.body;
      const onGrave = target instanceof HTMLElement && target.classList.contains("grave-button");
      const onRow = target instanceof HTMLElement && target.classList.contains("fix-row");
      if (!onBody && !onGrave && !onRow) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const next = stepWrap(selectedRef.current, event.key, order.length);
        if (next === null) return;
        event.preventDefault();
        setSelected(next);
        if (onGrave) document.querySelector<HTMLElement>(`.grave-button[data-grave-index="${String(next)}"]`)?.focus();
        return;
      }
      if (event.key === "Enter" && onBody) {
        const pkg = selectedRef.current === null ? undefined : order[selectedRef.current];
        if (pkg === undefined) return;
        event.preventDefault();
        openDrawer(pkg.name);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [keysActive, order, openDrawer]);

  const counts = useMemo(() => countsAt(response, shownMs), [response, shownMs]);
  const failingRules = response.replay === undefined ? response.policy.rules.filter((rule) => !rule.pass).length : 0;
  const head = headline(counts.counts, counts.total, date, failingRules);
  const notes = useMemo(() => notices(response), [response]);
  const fixRows = useMemo(() => fixOrder(response.report.packages, response.remediations), [response]);
  const plans = useMemo(() => plansByName(response.remediations), [response]);
  const filter = screen.filter;
  const list = screen.view.list;
  const reserve = useReserve(loadId);
  const [panelRef, panelScroll] = usePanelScroll();
  const lookedForm = lookedPkg === undefined ? undefined : formOf(response, lookedPkg, shownMs);
  const overlays = overlayRects(0);

  return (
    <div className="home">
      <section className="home-left">
        <div className="hero" inert={still}>
          <h1 className="headline">
            {head.count === null ? null : <em className="headline-count">{head.count}</em>}
            {head.text}
          </h1>
          {notes.map((note) => (
            <p key={note} className="notice">
              {note}
            </p>
          ))}
          <div className="chip-row">
            <div className="chips" role="group" aria-label="Show one state">
              {STATES.map((state: State) => (
                <button
                  key={state}
                  type="button"
                  className={`chip chip-${state.toLowerCase()}`}
                  aria-pressed={filter === state}
                  onClick={() => {
                    dispatch({ kind: "filter", state: filter === state ? null : state });
                  }}
                >
                  <span className="chip-dot" aria-hidden="true" />
                  {state} <b>{counts.counts[state]}</b>
                </button>
              ))}
            </div>
            <div className="view-switch" role="group" aria-label="View">
              <button
                type="button"
                aria-pressed={!list}
                onClick={() => {
                  if (list) dispatch({ kind: "list", on: false });
                }}
              >
                Graveyard
              </button>
              <button
                type="button"
                aria-pressed={list}
                onClick={() => {
                  if (!list) dispatch({ kind: "list", on: true });
                }}
              >
                List
              </button>
            </div>
          </div>
        </div>
        <div className="scene-card" data-tour="scene">
          {/* The help line gives way to the date badge, so the two never overlap in a narrow Scene. */}
          {list || date !== null ? null : (
            <p className="scene-help" style={{ left: overlays.help.x, top: overlays.help.y }}>
              {HELP_LINE}
            </p>
          )}
          {date !== null && !list ? (
            <p className="date-badge" style={{ top: overlays.badge.y }}>
              Viewing {date}
            </p>
          ) : null}
          <div className="scene-body" inert={veiled}>
          <Cemetery
            response={response}
            theme={theme}
            reducedMotion={reducedMotion}
            asOfMs={asOfMs}
            repoFieldRef={repoFieldRef}
            selected={selected}
            onSelect={setSelected}
            onLook={onLook}
            reserve={reserve}
            scanKind={scanKind ?? "live"}
            popoverOpen={screen.popover !== "none"}
            {...(onTerm !== undefined ? { onTerm } : {})}
            {...(onGuide !== undefined ? { onGuide } : {})}
            open={veiled || badGrave ? null : grave}
            onOpen={openDrawer}
            onClose={closeDrawer}
            filter={filter}
            beat={beat ?? null}
            {...(list ? { replaceScene: <ListView response={response} filter={filter} at={shownMs} indexOf={indexOf} onOpen={openFromList} /> } : {})}
            {...(onRemediate !== undefined ? { onRemediate } : {})}
          />
          </div>
          {veil === undefined ? null : <div className="scene-veil">{veil}</div>}
        </div>
        <footer className="night-footer foot-bar" inert={still}>
          {showScrubber ? (
            <Scrubber stops={stops} index={index} onChange={onDate} inputRef={scrubberRef} />
          ) : response.timelinesOmitted === "too-large" ? (
            <p className="history-omitted">{HISTORY_OMITTED_TEXT}</p>
          ) : null}
          {earlier ? (
            <button type="button" className="button" onClick={onBackToNow}>
              {BACK_TO_NOW}
            </button>
          ) : null}
          <AttackPicker
            open={screen.popover === "attacks"}
            onToggle={() => {
              dispatch(screen.popover === "attacks" ? { kind: "close-popover" } : { kind: "open-popover", popover: "attacks" });
            }}
            onReplay={onReplay}
          />
        </footer>
      </section>
      {lookedPkg === undefined || looked === null ? null : (
        <aside ref={panelRef} className="panel" aria-label="Details" inert={still} {...(panelScroll ? { "data-scroll": "" } : {})}>
          <Inspector
            pkg={lookedPkg}
            state={lookedForm?.state ?? null}
            version={lookedForm?.version ?? lookedPkg.installedVersion}
            date={date}
            selected={hover === null && focus === null}
            proposed={plans.get(lookedPkg.name)?.status === "proposed"}
            onOpen={openDrawer}
            {...(onTerm !== undefined ? { onTerm } : {})}
          />
          <FixOrder rows={fixRows} current={lookedPkg.name} onPick={pick} />
        </aside>
      )}
    </div>
  );
}
