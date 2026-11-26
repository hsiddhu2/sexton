// Home (spec clean-site, design C3 and the Architecture): the headline, notices, chips and the Graveyard / List
// switch; the Scene card with the help line and date badge; the Footer bar; and the Panel. A Replay has its own view
// (replay/ReplayView.tsx). Components only render and route events; the rules are in the pure modules they call.
import type { PackageHealth, ScanResponse, State } from "@sexton/api";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Cemetery } from "../Cemetery.js";
import { LoadingCard } from "../LoadingCard.js";
import type { Term } from "../glossary/glossary.js";
import { dayText } from "../header/format-scan-time.js";
import type { ScanKind } from "../drawer/fix-view.js";
import type { RemediateView } from "../load/remediate-client.js";
import type { ScreenEvent, ScreenState } from "../load/screen-state.js";
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

export const HELP_LINE = "Point at a grave to see its details on the right. Click it to open.";
export const BACK_TO_NOW = "Back to now";
const NO_STOPS: readonly number[] = [];

export interface HomeViewProps {
  readonly load: LoadState;
  readonly screen: ScreenState;
  readonly dispatch: (event: ScreenEvent) => void;
  readonly theme: Theme;
  readonly reducedMotion: boolean;
  readonly repoFieldRef: RefObject<HTMLInputElement | null>;
  /** The repository as owner/name while a Live scan loads, for the scanning card (1.14); else null. */
  readonly scanning: string | null;
  readonly onRemediate?: (packageName: string) => Promise<RemediateView>;
  readonly onReplay: (id: ReplayId) => void;
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
  /** The kind of scan, for the Drawer's fix tab (7.13 to 7.15). */
  readonly scanKind?: ScanKind;
  /** Opens the Guide page (the fix tab's "How does this work?"). */
  readonly onGuide?: () => void;
}

export function HomeView(props: HomeViewProps) {
  const { load } = props;
  if (load.status === "ready") return <ReadyHome {...props} response={load.response} loadId={load.loadId} />;
  return (
    <div className="home">
      <section className="home-left">
        <div className="scene-card scene-card-waiting">
          {load.status === "loading" ? (
            props.scanning !== null ? <ScanningCard label={props.scanning} /> : <LoadingCard />
          ) : (
            <section role="alert" className="load-error">
              <h2>Scan could not be loaded</h2>
              <p>
                <code>{load.error.code}</code>: {load.error.message}
              </p>
              {load.error.contractErrors === undefined ? null : (
                <ul>
                  {load.error.contractErrors.map((e, i) => (
                    <li key={i}>
                      {e.path} {e.code} {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

interface ReadyProps extends HomeViewProps {
  readonly response: ScanResponse;
  readonly loadId: number;
}

/** The scan Form of a package and its Form at an instant, from its Segments; never a state rule. */
function formOf(response: ScanResponse, pkg: PackageHealth, atMs: number | null): FormView {
  const scanForm: FormView = { state: pkg.state, reason: pkg.stateReason, ghost: hasGhost(pkg) };
  return atMs === null ? scanForm : formAt(timelineOf(response, pkg.name), atMs, scanForm);
}

function ReadyHome({ response, loadId, screen, dispatch, theme, reducedMotion, repoFieldRef, onRemediate, onReplay, onTerm, scanKind, onGuide }: ReadyProps) {
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
  const [selected, setSelected] = useState<number | null>(() => (order.length > 0 ? 0 : null));
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const onLook = useCallback((h: number | null, f: number | null): void => {
    setHover(h);
    setFocus(f);
  }, []);
  const looked = hover ?? focus ?? selected;
  const lookedPkg = looked === null ? undefined : order[looked];

  const drawerOpen = screen.owner === "drawer";
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
  const keysActive = screen.owner === "none" && screen.popover === "none";
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
  const head = headline(counts.counts, counts.total, date);
  const notes = useMemo(() => notices(response), [response]);
  const fixRows = useMemo(() => fixOrder(response.report.packages, response.remediations), [response]);
  const plans = useMemo(() => plansByName(response.remediations), [response]);
  const filter = screen.filter;
  const list = screen.view.list;
  const reserve = useReserve(loadId);
  const lookedForm = lookedPkg === undefined ? undefined : formOf(response, lookedPkg, shownMs);
  const overlays = overlayRects(0);

  return (
    <div className="home">
      <section className="home-left">
        <div className="hero" inert={drawerOpen}>
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
            open={screen.view.grave}
            onOpen={openDrawer}
            onClose={closeDrawer}
            filter={filter}
            {...(list ? { replaceScene: <ListView response={response} filter={filter} at={shownMs} indexOf={indexOf} onOpen={openFromList} /> } : {})}
            {...(onRemediate !== undefined ? { onRemediate } : {})}
          />
        </div>
        <footer className="night-footer foot-bar" inert={drawerOpen}>
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
        <aside className="panel" aria-label="Details" inert={drawerOpen}>
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
