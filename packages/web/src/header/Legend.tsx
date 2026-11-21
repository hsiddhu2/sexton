import { useState } from "react";
import { STATES } from "../load/lists.js";
import { colourFor, type Theme } from "../scene/palette.js";
import { GHOST_PATH, SHAPES, SHAPE_BY_STATE } from "../scene/shapes.js";

export const TRIAGE_ORDER_TEXT =
  "Triage order: Possessed first, then state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then highest advisory severity, then transitive reach, then name.";

export interface LegendProps {
  readonly theme: Theme;
}

export function Legend({ theme }: LegendProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="legend">
      <button
        type="button"
        className="legend-toggle"
        aria-expanded={open}
        aria-controls="legend-panel"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        Legend
      </button>
      <div id="legend-panel" className="legend-panel" hidden={!open}>
        <ul className="legend-states">
          {STATES.map((state) => {
            const shape = SHAPES[SHAPE_BY_STATE[state]];
            return (
              <li key={state}>
                <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" focusable="false">
                  <path d={shape.d} fill={colourFor(state, theme)} />
                  {shape.detail === null ? null : <path d={shape.detail} fill="none" stroke="currentColor" />}
                </svg>{" "}
                <span>{state}</span>
              </li>
            );
          })}
          <li>
            <svg viewBox="0 0 12 14" width="24" height="28" aria-hidden="true" focusable="false">
              <path d={GHOST_PATH} fill="currentColor" />
            </svg>{" "}
            <span>Ghost: one or more advisories</span>
          </li>
        </ul>
        <p>{TRIAGE_ORDER_TEXT}</p>
      </div>
    </div>
  );
}
