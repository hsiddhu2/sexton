import type { ScanResponse, State } from "@sexton/api";
import type { Beat } from "./scene/motion.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Drawer } from "./drawer/Drawer.js";
import type { RemediateView } from "./load/remediate-client.js";
import { drawerModel } from "./drawer/drawer-model.js";
import { fixView, type ScanKind } from "./drawer/fix-view.js";
import { historyRows } from "./drawer/history-rows.js";
import type { Term } from "./glossary/glossary.js";
import { plansByName } from "./panel/fix-order.js";
import { useContainerWidth } from "./hooks/use-container-width.js";
import { useMediaQuery } from "./hooks/use-media-query.js";
import { useFontsReady } from "./hooks/use-fonts-ready.js";
import { fitHeight, useFreeHeight, usePinnedFooterHeight } from "./hooks/use-free-height.js";
import { useGhostPhase } from "./hooks/use-ghost-phase.js";
import { scanTimeView } from "./header/format-scan-time.js";
import { GraveButtons } from "./overlay/GraveButtons.js";
import { hasGhost, planScene, REPLAY_MIN_SCENE_HEIGHT, type Theme } from "./scene/layout.js";
import { Scene } from "./scene/Scene.js";
import { formAt, timelineOf, type FormView } from "./time/form-at.js";
import { useBurial } from "./time/use-burial.js";
import { triageOrder } from "./triage/triage.js";
import { burstStopFor } from "./replay/burst-stop.js";
import { BURST_MS } from "./scene/burst.js";
import { loadMomentMs } from "./scene/rise.js";
import { claimLoadMoment } from "./scene/load-moment.js";

/**
 * The shortest Scene with a reserve below it (spec clean-site, 3.29): room for the smallest sky band and the demo's
 * three Tiers at the smallest fit scale (32 + 120 + 546.6 x 0.4 = 371 px), so a short screen keeps the demo in view.
 */
export const MIN_SCENE_HEIGHT = 380;
/** The Narrow layout of spec clean-site: under 700 px, the breakpoint of styles.css. */
export const NARROW_QUERY = "(max-width: 699px)";

export interface CemeteryProps {
  readonly response: ScanResponse;
  readonly theme: Theme;
  readonly reducedMotion: boolean;
  /** The chosen As-of instant in ms, or null when the response has no Timeline. */
  readonly asOfMs?: number | null;
  /** The Repository URL box in the header; a press on it while the drawer is open closes the drawer and focuses it. */
  readonly repoFieldRef?: RefObject<HTMLInputElement | null>;
  /** Opens a pull request; present only for a hosted scan with actions.remediate true (spec remediate, 9.2). */
  readonly onRemediate?: (packageName: string) => Promise<RemediateView>;
  /**
   * Spec clean-site: the Selected grave (an index in triage order) when the page owns it. Absent, the Cemetery keeps
   * its own selection, as before.
   */
  readonly selected?: number | null;
  readonly onSelect?: (index: number) => void;
  /**
   * Spec clean-site, design C1: the package whose Drawer is open when the screen state owns it (null for none), with
   * the open and close requests. Absent, the Cemetery keeps its own Drawer state (the Cemetery-only tests use that).
   * A Replay passes null and no-op requests, so its grave opens nothing (8.19).
   */
  readonly open?: string | null;
  readonly onOpen?: (name: string) => void;
  readonly onClose?: () => void;
  /** Spec clean-site, 2.7 and 2.8: graves of another State at the shown date are dimmed and leave the tab order. */
  readonly filter?: State | null;
  /** Spec clean-site, 14.3: the music beat the Characters follow while Music is on. */
  readonly beat?: Beat | null;
  /** Told the grave under the pointer and the grave whose button has focus, for the Inspector (3.3 to 3.5). */
  readonly onLook?: (hover: number | null, focus: number | null) => void;
  /** Height kept free under the Scene for the Footer bar and the site footer (spec clean-site). */
  readonly reserve?: number;
  /** Shown in place of the Scene (the List, spec clean-site 6.1); the Drawer still opens from it. */
  readonly replaceScene?: ReactNode;
  /** The kind of scan, for the Drawer's fix tab (spec clean-site, 7.13 to 7.15). Absent, a Cemetery with onRemediate is a Live scan with actions. */
  readonly scanKind?: ScanKind;
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
  /** Opens the Guide page from the fix tab's "How does this work?". */
  readonly onGuide?: () => void;
  /** True while a Pop-over is open, so Escape closes it before the Drawer (10.3). */
  readonly popoverOpen?: boolean;
}

export function Cemetery({ response, theme, reducedMotion, asOfMs = null, repoFieldRef, onRemediate, ...page }: CemeteryProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const order = useMemo(() => triageOrder(response.report.packages), [response]);
  const [localSelected, setLocalSelected] = useState<number | null>(() => (order.length > 0 ? 0 : null));
  const [localOpen, setLocalOpen] = useState<number | null>(null);
  const selectionOwned = page.selected !== undefined;
  const selectedIndex = page.selected === undefined ? localSelected : page.selected;
  const pageSelect = page.onSelect;
  const setSelectedIndex = useCallback(
    (index: number): void => {
      if (selectionOwned) pageSelect?.(index);
      else setLocalSelected(index);
    },
    [selectionOwned, pageSelect],
  );
  const openIndex = useMemo((): number | null => {
    if (page.open === undefined) return localOpen;
    if (page.open === null) return null;
    const i = order.findIndex((p) => p.name === page.open);
    return i === -1 ? null : i;
  }, [page.open, localOpen, order]);
  const pageOpen = page.onOpen;
  const pageClose = page.onClose;
  const controlled = page.open !== undefined;
  const setOpenIndex = useCallback(
    (index: number | null): void => {
      if (!controlled) {
        setLocalOpen(index);
        return;
      }
      if (index === null) pageClose?.();
      else {
        const name = order[index]?.name;
        if (name !== undefined) pageOpen?.(name);
      }
    },
    [controlled, pageOpen, pageClose, order],
  );
  // The grave under the pointer, for the hover ring (spec clean-site, 3.13).
  const [hover, setHover] = useState<number | null>(null);
  // The Inspector is told in the same event as the hover ring, so a press on the Panel right after the pointer
  // leaves a grave lands on the package the Panel now shows (spec clean-site, D5).
  const look = useRef<{ hover: number | null; focus: number | null }>({ hover: null, focus: null });
  const onLook = page.onLook;
  const onHover = useCallback(
    (index: number | null): void => {
      look.current = { ...look.current, hover: index };
      setHover(index);
      onLook?.(index, look.current.focus);
    },
    [onLook],
  );
  const onFocusGrave = useCallback(
    (index: number | null): void => {
      look.current = { ...look.current, focus: index };
      onLook?.(look.current.hover, index);
    },
    [onLook],
  );
  // The grave under the pointer or holding focus gets the Lantern glow (spec cemetery-undead, 6.4).
  const [lantern, setLantern] = useState<number | null>(null);
  // Spec clean-site, 7.22: whatever closes the Drawer (its own controls, or the screen state on Escape), focus goes
  // back to the grave button or List row that opened it, unless the close moved focus to the Scan field.
  const lastOpen = useRef<number | null>(null);
  const keepFocus = useRef(false);
  const quietFocus = useRef(false);
  const width = useContainerWidth(containerRef);
  // The Narrow layout stacks the Tiers front first, so the worst graves come first from the top (15.3).
  const frontFirst = useMediaQuery(NARROW_QUERY);
  const free = useFreeHeight(containerRef, width);
  const footerHeight = usePinnedFooterHeight(width, response);
  const reserve = page.reserve ?? 0;
  // With a reserve the Scene ends above the Footer bar and the site footer, and its graves stand at its bottom. The
  // free height is rounded up, so one pixel less keeps a fractional top from pushing the page past the viewport (3.28).
  // A replay's one grave, at full size, fits a Scene a little shorter in the Wide and Middle layouts (3.29); the Narrow
  // layout keeps the minimum.
  const minScene = response.replay !== undefined && !frontFirst ? REPLAY_MIN_SCENE_HEIGHT : MIN_SCENE_HEIGHT;
  const minHeight = reserve > 0 ? Math.max(minScene, free - reserve - 1) : free;
  const fit = reserve > 0 ? (free > 0 ? minHeight : 0) : fitHeight(free, footerHeight, footerHeight > 0);
  const anyGhost = useMemo(() => order.some(hasGhost), [order]);
  const phase = useGhostPhase(anyGhost, reducedMotion);
  // A new plan object once the canvas fonts load, so the Scene repaints with them (spec cemetery-undead, 2.4).
  const fontsReady = useFontsReady();
  // The Form of each grave as of the chosen instant: a lookup in the Segments, never a state rule.
  // At the scan date a grave without a versioned Segment keeps the scan Form.
  const views = useMemo((): readonly (FormView | undefined)[] | undefined => {
    if (asOfMs === null) return undefined;
    const scanMs = Date.parse(response.report.generatedAt);
    return order.map((pkg) => {
      const timeline = timelineOf(response, pkg.name);
      if (timeline === undefined) return undefined;
      const view = formAt(timeline, asOfMs, { state: pkg.state, reason: pkg.stateReason, ghost: hasGhost(pkg) });
      return asOfMs < scanMs || view.version !== undefined ? view : undefined;
    });
  }, [order, response, asOfMs]);
  // Spec clean-site, 2.7: every grave of another State at the shown date, and every Not-published mound, is dimmed.
  const filter = page.filter ?? null;
  const beat = page.beat ?? null;
  const dimmedNames = useMemo((): ReadonlySet<string> | undefined => {
    if (filter === null) return undefined;
    const out = new Set<string>();
    order.forEach((pkg, i) => {
      const view = views?.[i];
      const state = view === undefined ? pkg.state : view.state;
      if (state !== filter) out.add(pkg.name);
    });
    return out;
  }, [filter, order, views]);
  // The one grave in the tab order: the Selected grave, or the first one not dimmed while it is (2.8, 16.8).
  const tabStop = useMemo((): number | null => {
    if (dimmedNames === undefined || selectedIndex === null) return selectedIndex;
    if (!dimmedNames.has(order[selectedIndex]?.name ?? "")) return selectedIndex;
    const first = order.findIndex((p) => !dimmedNames.has(p.name));
    return first === -1 ? null : first;
  }, [dimmedNames, selectedIndex, order]);
  const drawerOpen = openIndex !== null;
  const burial = useBurial({ reducedMotion, drawerOpen });
  // A mark comes from the response log or the session list, never from a plan in `remediations` (14.5, 14.6).
  const logged = useMemo(() => new Set((response.pullRequests ?? []).map((m) => m.package)), [response]);
  const marks = useMemo(
    () => order.map((pkg) => (logged.has(pkg.name) && !burial.held.has(pkg.name)) || burial.shown.has(pkg.name)),
    [order, logged, burial.held, burial.shown],
  );
  const burialIndex = burial.burial === null ? -1 : order.findIndex((p) => p.name === burial.burial?.name);
  const vigilIndex = burial.vigil === null ? -1 : order.findIndex((p) => p.name === burial.vigil?.name);
  // The Load moment: the first non-empty scan after a page load rises out of the ground, unless motion is reduced.
  const [riseStart] = useState<number | null>(() => {
    if (order.length === 0 || !claimLoadMoment()) return null;
    return reducedMotion ? null : Date.now();
  });
  const [rising, setRising] = useState(riseStart !== null);
  useEffect(() => {
    if (riseStart === null) return undefined;
    const timer = setTimeout(() => {
      setRising(false);
    }, loadMomentMs(order.length) + 50);
    return () => {
      clearTimeout(timer);
    };
  }, [riseStart, order.length]);
  // The replay Burst: each arrival at the Burst Stop plays it once, with no caption (spec clean-site, 4.5).
  const burstStopMs = useMemo(() => burstStopFor(response, order), [response, order]);
  const [burstStart, setBurstStart] = useState<number | null>(null);
  const [burstDone, setBurstDone] = useState(false);
  const lastAsOf = useRef<number | null | undefined>(undefined);
  // A layout effect, so the first paint at the Burst Stop is already the Burst's first frame (review note, task 9.6).
  useLayoutEffect(() => {
    const previous = lastAsOf.current;
    lastAsOf.current = asOfMs;
    if (burstStopMs === null || asOfMs !== burstStopMs) {
      setBurstStart(null);
      return undefined;
    }
    if (previous === asOfMs) return undefined;
    setBurstStart(Date.now());
    setBurstDone(false);
    return undefined;
  }, [asOfMs, burstStopMs]);
  // The Burst leaves the plan BURST_MS after its start, so the Halo returns (review note, tasks 6 and 7).
  useEffect(() => {
    if (burstStart === null) return undefined;
    const timer = setTimeout(() => {
      setBurstDone(true);
    }, BURST_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [burstStart]);
  const atBurst = burstStart !== null && burstStopMs !== null && asOfMs === burstStopMs;
  const plan = useMemo(
    () =>
      planScene({
        packages: order,
        width,
        theme,
        selectedIndex,
        ghostPhase: phase,
        minHeight,
        fitHeight: fit,
        replay: response.replay !== undefined,
        marks,
        reducedMotion,
        lantern,
        ...(burial.burial !== null && burialIndex >= 0 ? { burial: { index: burialIndex, phase: burial.burial.phase } } : {}),
        ...(burial.burial !== null && burialIndex >= 0
          ? { priest: { index: burialIndex, phase: burial.burial.phase } }
          : vigilIndex >= 0
            ? { priest: { index: vigilIndex, phase: null } }
            : {}),
        ...(views !== undefined ? { forms: views } : {}),
        ...(atBurst && !burstDone ? { burst: { index: 0, startMs: burstStart } } : {}),
        ...(rising && riseStart !== null ? { rise: { startMs: riseStart } } : {}),
        ...(dimmedNames !== undefined ? { dimmed: dimmedNames } : {}),
        hover: drawerOpen ? null : hover,
        frontFirst,
        ...(beat != null ? { beat } : {}),
      }),
    [order, width, theme, selectedIndex, phase, minHeight, fit, views, marks, burial.burial, burialIndex, vigilIndex, fontsReady, reducedMotion, lantern, atBurst, burstDone, burstStart, rising, riseStart, dimmedNames, hover, drawerOpen, beat, frontFirst],
  );
  const request = burial.request;
  const onRemediateWithBurial = useMemo(
    () =>
      onRemediate === undefined
        ? undefined
        : async (packageName: string): Promise<RemediateView> => {
            const view = await onRemediate(packageName);
            if (view.status === "opened" || view.status === "existing") request(packageName);
            return view;
          },
    [onRemediate, request],
  );
  const onOpen = useCallback(
    (index: number): void => {
      setSelectedIndex(index);
      setOpenIndex(index);
    },
    [setSelectedIndex, setOpenIndex],
  );
  const onClose = useCallback((): void => {
    setOpenIndex(null);
  }, [setOpenIndex]);
  useLayoutEffect(() => {
    const index = lastOpen.current;
    lastOpen.current = openIndex;
    if (openIndex !== null || index === null) return;
    if (keepFocus.current) {
      keepFocus.current = false;
      return;
    }
    quietFocus.current = true;
    containerRef.current?.querySelector<HTMLElement>(`[data-grave-index="${String(index)}"]`)?.focus();
    quietFocus.current = false; // focus events are synchronous; never leave the flag set for a later, real focus
  }, [openIndex]);
  const openPackage = openIndex === null ? undefined : order[openIndex];
  const plans = useMemo(() => plansByName(response.remediations), [response]);
  const onDismissToField = useCallback(
    (x: number, y: number): boolean => {
      const field = repoFieldRef?.current;
      if (field == null || field.disabled) return false;
      const r = field.getBoundingClientRect();
      if (r.width === 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
      keepFocus.current = true; // focus stays in the field
      field.focus();
      setOpenIndex(null);
      return true;
    },
    [repoFieldRef, setOpenIndex],
  );
  const openView = openIndex === null ? undefined : views?.[openIndex];
  const openVersion = openView?.version;
  const asOfLine =
    openView !== undefined && openVersion !== undefined && asOfMs !== null
      ? `State on ${scanTimeView(new Date(asOfMs).toISOString()).text}: ${openView.state ?? "Not published"}. ${openView.reason}`
      : undefined;
  return (
    <>
      <div inert={openPackage !== undefined}>
        <div className="scene-main">
          <div ref={containerRef} className="scene-container">
            {page.replaceScene !== undefined ? (
              page.replaceScene
            ) : order.length === 0 ? (
              <p className="cemetery-empty">no direct dependencies in this scan</p>
            ) : (
              <>
                <Scene plan={plan} />
                <GraveButtons
                  plan={plan}
                  selectedIndex={selectedIndex}
                  packages={order}
                  onSelect={setSelectedIndex}
                  onOpen={onOpen}
                  suppressLantern={drawerOpen}
                  quietFocus={quietFocus}
                  onLantern={setLantern}
                  onHover={onHover}
                  onFocusGrave={onFocusGrave}
                  tabStop={tabStop}
                  {...(dimmedNames !== undefined ? { dimmed: dimmedNames } : {})}
                  {...(views !== undefined ? { views } : {})}
                />
              </>
            )}
          </div>
        </div>
      </div>
      {openPackage === undefined ? null : (
        <Drawer
          key={openPackage.name}
          model={drawerModel(response, openPackage, openVersion)}
          fix={fixView(openPackage, plans.get(openPackage.name), page.scanKind ?? (onRemediate !== undefined ? "live-remediate" : "live"))}
          history={historyRows(response, openPackage.name)}
          {...(asOfLine !== undefined ? { asOfLine } : {})}
          onClose={onClose}
          onDismissToField={onDismissToField}
          {...(onRemediateWithBurial !== undefined ? { onRemediate: onRemediateWithBurial } : {})}
          {...(page.onTerm !== undefined ? { onTerm: page.onTerm } : {})}
          {...(page.onGuide !== undefined ? { onGuide: page.onGuide } : {})}
          popoverOpen={page.popoverOpen ?? false}
        />
      )}
    </>
  );
}
