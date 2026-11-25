import type { PackageHealth } from "@sexton/api";
import { useEffect, useRef, type KeyboardEvent, type MutableRefObject } from "react";
import type { FormView } from "../time/form-at.js";
import type { ScenePlan } from "../scene/layout.js";
import { reduceSelection } from "../selection/selection.js";
import { graveLabel } from "./grave-label.js";
import { GraveTooltip, TOOLTIP_ID } from "./GraveTooltip.js";
import { labelRect } from "../scene/art-box.js";
import { useGraveTooltip } from "./use-grave-tooltip.js";

export interface GraveButtonsProps {
  readonly plan: ScenePlan;
  readonly selectedIndex: number | null;
  readonly packages: readonly PackageHealth[];
  readonly onSelect: (index: number) => void;
  readonly onOpen: (index: number) => void;
  /** True while the drawer is open: no tooltip is shown. */
  readonly suppressTooltip?: boolean;
  /** Set by the parent before it returns focus to a grave in code; that one focus shows no tooltip. */
  readonly quietFocus?: MutableRefObject<boolean>;
  /** The Form of each grave as of the chosen date, in triage order; undefined entries show the scan Form. */
  readonly views?: readonly (FormView | undefined)[];
  /** The As-of date text for the tooltip, set only before the scan date. */
  readonly asOfDate?: string;
  /** Told the grave whose tooltip shows (hovered or focused), for the Lantern glow; null when none. */
  readonly onLantern?: (index: number | null) => void;
  /** Serious mode hides the tooltip Punchline. */
  readonly serious?: boolean;
}

export function GraveButtons({ plan, selectedIndex, packages, onSelect, onOpen, suppressTooltip = false, quietFocus, views, asOfDate, onLantern, serious = false }: GraveButtonsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { shownIndex, dispatch } = useGraveTooltip(suppressTooltip);
  useEffect(() => {
    onLantern?.(shownIndex);
  }, [shownIndex, onLantern]);
  // The tooltip takes no pointer events, so clicks reach what lies under it. While it shows, a pointer over its area
  // still counts as over the tooltip, wherever it opens (spec cemetery-undead-fixes, bug 3; WCAG 1.4.13, hoverable).
  useEffect(() => {
    if (shownIndex === null) return undefined;
    let over = false;
    const onMove = (e: PointerEvent): void => {
      const tip = document.getElementById(TOOLTIP_ID);
      if (tip === null) return;
      const r = tip.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside === over) return;
      over = inside;
      if (inside) {
        dispatch({ type: "tip-enter" });
        return;
      }
      // Back over its own grave (the part the tooltip does not cover): the grave holds the tooltip again (review).
      const button = document.querySelector<HTMLElement>(`button[data-grave-index="${String(shownIndex)}"]`);
      const b = button?.getBoundingClientRect();
      const onGrave = b !== undefined && e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
      dispatch(onGrave ? { type: "pointer-enter", index: shownIndex } : { type: "tip-leave" });
    };
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointermove", onMove);
    };
  }, [shownIndex, dispatch]);
  const shownPkg = shownIndex === null ? undefined : packages[shownIndex];
  const shownCell = shownIndex === null ? undefined : plan.graves[shownIndex]?.rect;

  // A focus counts as key-driven when a key was pressed after the last pointer press (any element, so Tab into the grave counts).
  const keyDriven = useRef(false);
  useEffect(() => {
    const onKey = (): void => {
      keyDriven.current = true;
    };
    const onPointer = (): void => {
      keyDriven.current = false;
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const outcome = reduceSelection(selectedIndex, event, plan.columns, packages.length);
    if (!outcome.handled) return;
    if (outcome.preventDefault) event.preventDefault();
    if (outcome.index === null) return;
    onSelect(outcome.index);
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-grave-index="${String(outcome.index)}"]`)?.focus();
  };

  if (packages.length === 0) return null;

  return (
    <div ref={rootRef} className="overlay">
      {packages.map((pkg, i) => {
        const rect = plan.graves[i]?.rect;
        if (rect === undefined) return null;
        return (
          <button
            key={pkg.name}
            type="button"
            className="grave-button"
            data-grave-index={i}
            aria-label={graveLabel(pkg, views?.[i], plan.graves[i]?.marker === true)}
            {...(i === shownIndex ? { "aria-describedby": TOOLTIP_ID } : {})}
            tabIndex={i === selectedIndex ? 0 : -1}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              onSelect(i);
              const programmatic = quietFocus?.current === true;
              if (quietFocus !== undefined) quietFocus.current = false;
              const key = !programmatic && keyDriven.current;
              keyDriven.current = false;
              dispatch({ type: "focus", index: i, key });
            }}
            onBlur={() => {
              dispatch({ type: "blur", index: i });
            }}
            onPointerEnter={(event) => {
              dispatch({ type: "pointer-enter", index: i, x: event.clientX, y: event.clientY });
            }}
            onPointerMove={(event) => {
              dispatch({ type: "pointer-move", index: i, x: event.clientX, y: event.clientY });
            }}
            onPointerLeave={() => {
              dispatch({ type: "pointer-leave", index: i });
            }}
            onClick={() => {
              onOpen(i);
            }}
          />
        );
      })}
      {shownPkg !== undefined && shownCell !== undefined ? (
        <GraveTooltip
          pkg={shownPkg}
          cell={shownCell}
          {...(shownIndex !== null && views?.[shownIndex] !== undefined ? { view: views[shownIndex] } : {})}
          {...(asOfDate !== undefined ? { asOfDate } : {})}
          sceneWidth={plan.width}
          sceneHeight={plan.groundHeight}
          labels={plan.graves.filter((g) => g.index !== shownIndex).map((g) => labelRect(g))}
          serious={serious}
          onPointerEnter={() => {
            dispatch({ type: "tip-enter" });
          }}
          onPointerLeave={() => {
            dispatch({ type: "tip-leave" });
          }}
        />
      ) : null}
    </div>
  );
}
