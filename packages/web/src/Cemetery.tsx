import type { ScanResponse } from "@sexton/api";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
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
}

export function Cemetery({ response, theme, reducedMotion, asOfMs = null, repoFieldRef, onRemediate, serious = false }: CemeteryProps) {
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
  const footerHeight = usePinnedFooterHeight(width);
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
        ...(views !== undefined ? { forms: views } : {}),
      }),
    [order, width, theme, selectedIndex, phase, minHeight, fit, views, marks, burial.burial, burialIndex, fontsReady, reducedMotion, lantern],
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
