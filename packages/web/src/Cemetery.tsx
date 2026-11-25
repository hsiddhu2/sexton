import type { ScanResponse } from "@sexton/api";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Drawer } from "./drawer/Drawer.js";
import type { RemediateView } from "./load/remediate-client.js";
import { drawerModel } from "./drawer/drawer-model.js";
import { useContainerWidth } from "./hooks/use-container-width.js";
import { useFontsReady } from "./hooks/use-fonts-ready.js";
import { fitHeight, useFreeHeight, usePinnedFooterHeight } from "./hooks/use-free-height.js";
import { useGhostPhase } from "./hooks/use-ghost-phase.js";
import { scanTimeView } from "./header/format-scan-time.js";
import { GraveButtons } from "./overlay/GraveButtons.js";
import { hasGhost, planScene, type Theme } from "./scene/layout.js";
import { Scene } from "./scene/Scene.js";
import { ReplayBanner } from "./replay/ReplayBanner.js";
import { DRAWER_SCAN_DATE_TEXT, SCRUB_NOTE_TEXT } from "./time/Scrubber.js";
import { formAt, timelineOf, type FormView } from "./time/form-at.js";
import { useBurial } from "./time/use-burial.js";
import { triageOrder } from "./triage/triage.js";
import { ghostCallDue } from "./sound/use-sound.js";
import { BURST_CAPTION, burstStopFor } from "./replay/burst-stop.js";
import { BURST_MS } from "./scene/burst.js";
import { loadMomentMs } from "./scene/rise.js";
import { claimLoadMoment } from "./scene/load-moment.js";
import { bellKey } from "./scene/characters/priest.js";
import { artRect, labelRect } from "./scene/art-box.js";
import type { Rect } from "./scene/layout.js";
import { Bubbles, bubbleLines } from "./speech/Bubbles.js";
import type { VoiceId } from "./sound/voices.js";

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
  /** Serious mode hides the Punchlines (spec cemetery-undead, 8). */
  readonly serious?: boolean;
  /** Plays a Voice when Sound is on (spec cemetery-undead-2, requirement 8). Absent, the cemetery is silent. */
  readonly play?: (voice: VoiceId) => void;
  /** A new value selects the Fix-first grave and focuses its button (spec judge-path, requirements 2.2 and 2.3). */
  readonly selectRequest?: number;
  /** Told when the drawer opens and closes, for the Guide (spec judge-path, requirements 1.18 to 1.20). */
  readonly onDrawer?: (open: boolean) => void;
  /** Filled with a reader of every grave's Name label in client coordinates, for the Guide (1.14). */
  readonly labelsRef?: RefObject<(() => readonly Rect[]) | null>;
}

export function Cemetery({ response, theme, reducedMotion, asOfMs = null, repoFieldRef, onRemediate, serious = false, play, selectRequest = 0, onDrawer, labelsRef }: CemeteryProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const order = useMemo(() => triageOrder(response.report.packages), [response]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() => (order.length > 0 ? 0 : null));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // The grave under the pointer or holding focus gets the Lantern glow (spec cemetery-undead, 6.4).
  const [lantern, setLantern] = useState<number | null>(null);
  const returnFocusTo = useRef<number | null>(null);
  const quietFocus = useRef(false);
  const width = useContainerWidth(containerRef);
  const minHeight = useFreeHeight(containerRef, width);
  const footerHeight = usePinnedFooterHeight(width, response);
  const fit = fitHeight(minHeight, footerHeight, footerHeight > 0);
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
  const beforeScan = asOfMs !== null && asOfMs < Date.parse(response.report.generatedAt);
  const asOfDate = beforeScan ? scanTimeView(new Date(asOfMs).toISOString()).text : undefined;
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
  const playRef = useRef(play);
  playRef.current = play;
  // The bell: once when the Priest starts reading, at burial phase WALK_END, or at the start of a Vigil (10.2).
  const belled = useRef<string | null>(null);
  const bell = bellKey(burial.burial, burial.vigil);
  useEffect(() => {
    if (bell === null) {
      belled.current = null;
      return;
    }
    if (belled.current === bell) return;
    belled.current = bell;
    playRef.current?.("bell");
  }, [bell]);
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
  // The replay Burst: each arrival at the Burst Stop plays it once, with the sting and the thud (requirement 9).
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
    playRef.current?.("sting");
    playRef.current?.("thud");
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
      }),
    [order, width, theme, selectedIndex, phase, minHeight, fit, views, marks, burial.burial, burialIndex, vigilIndex, fontsReady, reducedMotion, lantern, atBurst, burstDone, burstStart, rising, riseStart],
  );
  // The ghost call: a grave with a Ghost gains the Lantern glow by hover or focus, at most once every 1,500 ms.
  const lastGhostCall = useRef<number | null>(null);
  const lanternHasGhost = lantern !== null && plan.graves[lantern]?.ghost != null;
  useEffect(() => {
    if (!lanternHasGhost || play === undefined) return;
    const now = performance.now();
    if (!ghostCallDue(lastGhostCall.current, now)) return;
    lastGhostCall.current = now;
    play("ghost");
  }, [lantern, lanternHasGhost, play]);
  // Speech Bubbles speak from the Form shown at the chosen date; hidden in Serious mode and while the drawer is open.
  const lines = useMemo(() => bubbleLines(order, views), [order, views]);
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
  const onOpen = useCallback((index: number): void => {
    setSelectedIndex(index);
    setOpenIndex(index);
  }, []);
  const onClose = useCallback((): void => {
    returnFocusTo.current = openIndex;
    setOpenIndex(null);
  }, [openIndex]);
  useLayoutEffect(() => {
    if (openIndex !== null || returnFocusTo.current === null) return;
    const index = returnFocusTo.current;
    returnFocusTo.current = null;
    quietFocus.current = true;
    containerRef.current?.querySelector<HTMLElement>(`[data-grave-index="${String(index)}"]`)?.focus();
    quietFocus.current = false; // focus events are synchronous; never leave the flag set for a later, real focus
  }, [openIndex]);
  // Fix first: a new request selects triage index 0 and focuses its grave button, so its tooltip shows. A request
  // made before this load is not replayed (the value at mount is the baseline).
  const seenRequest = useRef(selectRequest);
  const focusFixFirst = useRef(false);
  useEffect(() => {
    if (selectRequest === seenRequest.current) return;
    seenRequest.current = selectRequest;
    if (order.length === 0) return;
    focusFixFirst.current = true;
    setSelectedIndex(0);
    setOpenIndex(null);
  }, [selectRequest, order.length]);
  useLayoutEffect(() => {
    if (!focusFixFirst.current || openIndex !== null) return;
    focusFixFirst.current = false;
    containerRef.current?.querySelector<HTMLElement>('[data-grave-index="0"]')?.focus();
  });
  const onDrawerRef = useRef(onDrawer);
  onDrawerRef.current = onDrawer;
  useEffect(() => {
    onDrawerRef.current?.(drawerOpen);
  }, [drawerOpen]);
  useEffect(
    () => () => {
      onDrawerRef.current?.(false);
    },
    [],
  );
  useEffect(() => {
    if (labelsRef === undefined) return undefined;
    labelsRef.current = () => {
      const box = containerRef.current?.getBoundingClientRect();
      if (box === undefined) return [];
      return plan.graves.map((g) => {
        const l = labelRect(g);
        return { x: box.left + l.x, y: box.top + l.y, w: l.w, h: l.h };
      });
    };
    return () => {
      labelsRef.current = null;
    };
  }, [labelsRef, plan]);
  const openPackage = openIndex === null ? undefined : order[openIndex];
  const onDismissToField = useCallback(
    (x: number, y: number): boolean => {
      const field = repoFieldRef?.current;
      if (field == null || field.disabled) return false;
      const r = field.getBoundingClientRect();
      if (r.width === 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
      returnFocusTo.current = null; // focus stays in the field
      field.focus();
      setOpenIndex(null);
      return true;
    },
    [repoFieldRef],
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
        <main className="scene-main">
          {/* A replay's story sits in a card over the scene, top left, as in the mockup (K2d fix 1). */}
          {response.replay === undefined ? null : (
            <ReplayBanner
              replay={response.replay}
              className="replay-card"
              {...(asOfMs !== null ? { date: scanTimeView(new Date(asOfMs).toISOString()).text } : {})}
              notes={beforeScan ? [SCRUB_NOTE_TEXT, DRAWER_SCAN_DATE_TEXT] : []}
            />
          )}
          <div ref={containerRef} className="scene-container">
            {order.length === 0 ? (
              <p className="cemetery-empty">no direct dependencies in this scan</p>
            ) : (
              <>
                <Scene plan={plan} />
                {/* No Bubble while the Burst caption shows: the caption speaks for the grave (spec cemetery-undead-fixes). */}
                <Bubbles plan={plan} lines={lines} hidden={serious || drawerOpen || atBurst} reducedMotion={reducedMotion} />
                {atBurst && plan.graves[0] !== undefined ? (
                  // Plain text over the scene, not a live region: the Play line already announces the Stop (9.2).
                  <p className="burst-caption" style={{ left: artRect(plan.graves[0]).x + artRect(plan.graves[0]).w / 2, top: plan.graves[0].rect.y }}>
                    {BURST_CAPTION}
                  </p>
                ) : null}
                <GraveButtons
                  plan={plan}
                  selectedIndex={selectedIndex}
                  packages={order}
                  onSelect={setSelectedIndex}
                  onOpen={onOpen}
                  suppressTooltip={drawerOpen}
                  quietFocus={quietFocus}
                  onLantern={setLantern}
                  serious={serious}
                  {...(views !== undefined ? { views } : {})}
                  {...(asOfDate !== undefined ? { asOfDate } : {})}
                />
              </>
            )}
          </div>
        </main>
      </div>
      {openPackage === undefined ? null : <Drawer model={drawerModel(response, openPackage, openVersion)} {...(response.replay !== undefined ? { replay: response.replay } : {})} {...(asOfLine !== undefined ? { asOfLine } : {})} onClose={onClose} onDismissToField={onDismissToField} serious={serious} {...(onRemediateWithBurial !== undefined ? { onRemediate: onRemediateWithBurial } : {})} />}
    </>
  );
}
