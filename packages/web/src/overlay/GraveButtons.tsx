import type { PackageHealth } from "@sexton/api";
import { useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import type { FormView } from "../time/form-at.js";
import type { ScenePlan } from "../scene/layout.js";
import { reduceSelection } from "../selection/selection.js";
import { graveLabel } from "./grave-label.js";

export interface GraveButtonsProps {
  readonly plan: ScenePlan;
  readonly selectedIndex: number | null;
  readonly packages: readonly PackageHealth[];
  readonly onSelect: (index: number) => void;
  readonly onOpen: (index: number) => void;
  /** True while the drawer is open: no grave holds the Lantern glow. */
  readonly suppressLantern?: boolean;
  /** Set by the parent before it returns focus to a grave in code; that one focus lights no Lantern. */
  readonly quietFocus?: MutableRefObject<boolean>;
  /** The Form of each grave as of the chosen date, in triage order; undefined entries show the scan Form. */
  readonly views?: readonly (FormView | undefined)[];
  /** Told the grave under the pointer, else the one holding key-driven focus, for the Lantern glow; null when none. */
  readonly onLantern?: (index: number | null) => void;
}

export function GraveButtons({ plan, selectedIndex, packages, onSelect, onOpen, suppressLantern = false, quietFocus, views, onLantern }: GraveButtonsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  // Opening the drawer resets both: nothing is lit after it closes until a pointer move or a key-driven focus.
  useEffect(() => {
    if (!suppressLantern) return;
    setHovered(null);
    setFocused(null);
  }, [suppressLantern]);
  const lit = suppressLantern ? null : (hovered ?? focused);
  useEffect(() => {
    onLantern?.(lit);
  }, [lit, onLantern]);

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
            tabIndex={i === selectedIndex ? 0 : -1}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              onSelect(i);
              const programmatic = quietFocus?.current === true;
              if (quietFocus !== undefined) quietFocus.current = false;
              const key = !programmatic && keyDriven.current;
              keyDriven.current = false;
              setFocused(key ? i : null);
            }}
            onBlur={() => {
              setFocused((f) => (f === i ? null : f));
            }}
            onPointerEnter={() => {
              setHovered(i);
            }}
            onPointerLeave={() => {
              setHovered((h) => (h === i ? null : h));
            }}
            onClick={() => {
              onOpen(i);
            }}
          />
        );
      })}
    </div>
  );
}
