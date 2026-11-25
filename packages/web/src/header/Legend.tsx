import { useState } from "react";
import { STATES } from "../load/lists.js";
import type { Theme } from "../scene/palette.js";
import { GHOST_PATH, SHAPES, SHAPE_BY_STATE } from "../scene/shapes.js";

export const TRIAGE_ORDER_TEXT =
  "Triage order: Possessed first, then state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then highest advisory severity, then transitive reach, then name.";

/** What each Form looks like, in words (spec cemetery-undead, 10.3). */
export const FORM_WORDS: Readonly<Record<(typeof STATES)[number], string>> = {
  Possessed: "open grave, a devil zombie dancing out",
  Dead: "cracked stone, a skeleton lounging",
  Haunted: "cross",
  Restless: "tilted stone, a hand clawing out",
  Alive: "rounded stone with a party hat",
};

export interface LegendProps {
  readonly theme: Theme;
}

// Colour comes from the CSS classes below, keyed by the Theme on the container.
export function Legend({ theme }: LegendProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="legend" data-theme={theme}>
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
              <li key={state} className="legend-chip">
                <svg
                  className={`legend-shape legend-shape-${state.toLowerCase()}`}
                  viewBox="0 0 64 64"
                  width="32"
                  height="32"
                  aria-hidden="true"
                  focusable="false"
                >
                  <g transform={shape.tiltDegrees === 0 ? undefined : `rotate(${String(shape.tiltDegrees)} 32 32)`}>
                    <path d={shape.d} />
                    {shape.detail === null ? null : <path className="legend-detail" d={shape.detail} fill="none" />}
                  </g>
                </svg>{" "}
                <span>
                  {state}: {FORM_WORDS[state]}
                </span>
              </li>
            );
          })}
          <li className="legend-chip legend-chip-pending">
            <svg className="legend-shape legend-shape-pending" viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" focusable="false">
              <path d={SHAPES.unmarked.d} />
            </svg>{" "}
            <span>Not published yet on the chosen date</span>
          </li>
          <li className="legend-chip legend-chip-marker">
            <svg className="legend-marker" viewBox="0 0 16 44" width="12" height="32" aria-hidden="true" focusable="false">
              <rect x="0" y="0" width="2" height="44" />
              <rect x="2" y="0" width="14" height="4" />
              <rect x="2" y="4" width="10" height="4" />
              <rect x="2" y="8" width="6" height="4" />
            </svg>{" "}
            <span>Pennant: a pull request was opened</span>
          </li>
          <li className="legend-chip legend-chip-ghost">
            <svg className="legend-ghost" viewBox="0 0 24 28" width="24" height="28" aria-hidden="true" focusable="false">
              <path d={GHOST_PATH} />
            </svg>{" "}
            <span>Ghost: one or more advisories</span>
          </li>
        </ul>
        <p className="legend-triage">{TRIAGE_ORDER_TEXT}</p>
      </div>
    </div>
  );
}
