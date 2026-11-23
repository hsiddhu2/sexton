import type { PackageHealth } from "@sexton/api";
import { useRef, type KeyboardEvent } from "react";
import type { ScenePlan } from "../scene/layout.js";
import { reduceSelection } from "../selection/selection.js";
import { graveLabel } from "./grave-label.js";
import { GraveTooltip, TOOLTIP_ID } from "./GraveTooltip.js";
import { useGraveTooltip } from "./use-grave-tooltip.js";

export interface GraveButtonsProps {
  readonly plan: ScenePlan;
  readonly selectedIndex: number | null;
  readonly packages: readonly PackageHealth[];
  readonly onSelect: (index: number) => void;
  readonly onOpen: (index: number) => void;
  /** True while the drawer is open: no tooltip is shown. */
  readonly suppressTooltip?: boolean;
}

export function GraveButtons({ plan, selectedIndex, packages, onSelect, onOpen, suppressTooltip = false }: GraveButtonsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { shownIndex, dispatch } = useGraveTooltip(suppressTooltip);
  const shownPkg = shownIndex === null ? undefined : packages[shownIndex];
  const shownCell = shownIndex === null ? undefined : plan.graves[shownIndex]?.rect;

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
            aria-label={graveLabel(pkg)}
            {...(i === shownIndex ? { "aria-describedby": TOOLTIP_ID } : {})}
            tabIndex={i === selectedIndex ? 0 : -1}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              onSelect(i);
              dispatch({ type: "focus", index: i });
            }}
            onBlur={() => {
              dispatch({ type: "blur", index: i });
            }}
            onPointerEnter={() => {
              dispatch({ type: "pointer-enter", index: i });
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
