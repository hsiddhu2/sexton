import type { ScanResponse } from "@sexton/api";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "./drawer/Drawer.js";
import { drawerModel } from "./drawer/drawer-model.js";
import { useContainerWidth } from "./hooks/use-container-width.js";
import { useGhostPhase } from "./hooks/use-ghost-phase.js";
import { GraveButtons } from "./overlay/GraveButtons.js";
import { hasGhost, planScene, type Theme } from "./scene/layout.js";
import { Scene } from "./scene/Scene.js";
import { triageOrder } from "./triage/triage.js";

export interface CemeteryProps {
  readonly response: ScanResponse;
  readonly theme: Theme;
  readonly reducedMotion: boolean;
  /** Called with true while the drawer is open, so the page header can be made inert too. */
  readonly onDrawerOpenChange?: (open: boolean) => void;
}

export function Cemetery({ response, theme, reducedMotion, onDrawerOpenChange }: CemeteryProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const order = useMemo(() => triageOrder(response.report.packages), [response]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() => (order.length > 0 ? 0 : null));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const returnFocusTo = useRef<number | null>(null);
  const width = useContainerWidth(containerRef);
  const anyGhost = useMemo(() => order.some(hasGhost), [order]);
  const phase = useGhostPhase(anyGhost, reducedMotion);
  const plan = useMemo(
    () => planScene({ packages: order, width, theme, selectedIndex, ghostPhase: phase }),
    [order, width, theme, selectedIndex, phase],
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
    containerRef.current?.querySelector<HTMLElement>(`[data-grave-index="${String(index)}"]`)?.focus();
  }, [openIndex]);
  const openPackage = openIndex === null ? undefined : order[openIndex];
  const drawerOpen = openPackage !== undefined;
  useLayoutEffect(() => {
    onDrawerOpenChange?.(drawerOpen);
    return () => {
      onDrawerOpenChange?.(false);
    };
  }, [drawerOpen, onDrawerOpenChange]);
  return (
    <>
      <div inert={openPackage !== undefined}>
        <main>
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
                />
              </>
            )}
          </div>
        </main>
      </div>
      {openPackage === undefined ? null : <Drawer model={drawerModel(response, openPackage)} onClose={onClose} />}
    </>
  );
}
