// The Legend (spec clean-site, design C11, requirements 13.1, 13.2, 13.11 and 13.12): a Pop-over under its button,
// outside the page flow, owned by the screen state, so opening it moves nothing. Eight entries: the five States with
// their meanings, the ghost, the pennant and the Not-published mound, each with its grave drawn by the scene painter.
import { claim } from "../copy/claims.js";
import { STATES } from "../load/lists.js";
import { GravePicture } from "../scene/GravePicture.js";
import type { Theme } from "../scene/palette.js";
import type { PictureKind } from "../scene/picture.js";
import { ListGlyph } from "./icons.js";

export const LEGEND_HEADING = "What each grave means";
/** The fix order line, a Claim resting on README.md's sentence on the order of the graves (13.1). */
export const LEGEND_FIX_ORDER = claim("legend.fix-order");

/** The three marks beside the States (13.1). */
export const LEGEND_MARKS: readonly { readonly kind: PictureKind; readonly name: string; readonly meaning: string }[] = [
  { kind: "ghost", name: "Ghost", meaning: "one or more advisories" },
  { kind: "pennant", name: "Pennant", meaning: "a pull request was opened" },
  { kind: "pending", name: "Mound", meaning: "not published yet on the chosen date" },
];

/** The picture height in the Legend, in CSS pixels. */
const PICTURE_HEIGHT = 36;

export interface LegendProps {
  readonly theme: Theme;
  readonly open?: boolean;
  readonly onToggle?: () => void;
}

export function Legend({ theme, open = false, onToggle }: LegendProps) {
  return (
    <div className="legend" data-theme={theme} data-popover="legend">
      <button type="button" className="ib legend-toggle" aria-expanded={open} aria-controls="legend-panel" onClick={onToggle}>
        <ListGlyph />
        <span className="ib-text">Legend</span>
      </button>
      <div id="legend-panel" className="legend-panel pop" hidden={!open}>
        <p className="pop-heading">{LEGEND_HEADING}</p>
        {open ? (
          <ul className="legend-states">
            {STATES.map((state) => (
              <li key={state} className="legend-chip">
                <GravePicture kind={state} theme={theme} height={PICTURE_HEIGHT} />
                <span className={`badge badge-${state.toLowerCase()}`}>
                  <span className="badge-dot" aria-hidden="true" />
                  {state}
                </span>
                <span className="legend-meaning">{claim(`state.${state}`)}</span>
              </li>
            ))}
            {LEGEND_MARKS.map((mark) => (
              <li key={mark.kind} className="legend-chip">
                <GravePicture kind={mark.kind} theme={theme} height={PICTURE_HEIGHT} />
                <span className="legend-name">{mark.name}</span>
                <span className="legend-meaning">{mark.meaning}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="legend-triage">{LEGEND_FIX_ORDER}</p>
      </div>
    </div>
  );
}
