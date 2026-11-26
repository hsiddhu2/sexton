// The one-row header (spec clean-site, design C2, requirement 1): the wordmark, the scan tag, the Scan field with its
// Scan button, then "What is Sexton?", Legend, Music (only with a track, 1.15) and Tour.
import type { RefObject } from "react";
import type { Popover } from "../load/screen-state.js";
import type { Theme } from "../scene/palette.js";
import { BookGlyph, TourGlyph } from "./icons.js";
import { Legend } from "./Legend.js";
import { ScanField } from "./ScanField.js";
import { Wordmark } from "./Wordmark.js";

export const GUIDE_BUTTON_TEXT = "What is Sexton?";
export const TOUR_BUTTON_TEXT = "Tour";

export interface HeaderProps {
  /** The scan tag text, or null when nothing is shown (a rejected replay value). */
  readonly tag: string | null;
  readonly theme: Theme;
  readonly apiConfigured: boolean;
  /** The Scan field, so the page can move focus to it. */
  readonly fieldRef?: RefObject<HTMLInputElement | null>;
  /** The open Pop-over of the screen state. */
  readonly popover: Popover;
  /** Opens a Pop-over, or closes the open one with "none". */
  readonly onPopover: (popover: Popover) => void;
  /** Starts a Live scan of a canonical repository URL. */
  readonly onScan: (url: string) => void;
  readonly onHome: () => void;
  readonly onGuide: () => void;
  readonly onTour: () => void;
}

export function Header({ tag, theme, apiConfigured, fieldRef, popover, onPopover, onScan, onHome, onGuide, onTour }: HeaderProps) {
  return (
    <header className="site-header">
      <Wordmark onHome={onHome} />
      {tag === null ? null : (
        <p className="scan-tag-wrap">
          <span className="scan-tag">{tag}</span>
        </p>
      )}
      <ScanField
        apiConfigured={apiConfigured}
        {...(fieldRef !== undefined ? { fieldRef } : {})}
        examplesOpen={popover === "examples"}
        onExamples={(open) => {
          if (open) onPopover("examples");
          else if (popover === "examples") onPopover("none");
        }}
        onScan={onScan}
      />
      <div className="header-buttons">
        <button type="button" className="ib ib-guide" onClick={onGuide}>
          <BookGlyph />
          <span className="ib-guide-text">{GUIDE_BUTTON_TEXT}</span>
        </button>
        <Legend
          theme={theme}
          open={popover === "legend"}
          onToggle={() => {
            onPopover(popover === "legend" ? "none" : "legend");
          }}
        />
        {/* Music renders only when a track is set in the Track slot (1.15, task 10); none is set. */}
        <button type="button" className="ib" data-tour-button onClick={onTour}>
          <TourGlyph />
          <span className="ib-text">{TOUR_BUTTON_TEXT}</span>
        </button>
      </div>
    </header>
  );
}
