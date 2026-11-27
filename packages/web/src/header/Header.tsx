// The one-row header (spec clean-site, design C2, requirement 1): the wordmark, the tabs "Overview" and "Cemetery"
// (spec home-page, 12.5), the scan tag, the Scan field with its Scan button, then "What is Sexton?", Legend, Music
// (only with a track, 1.15) and Tour.
import type { RefObject } from "react";
import type { Entry } from "../cache/scan-cache.js";
import type { Popover } from "../load/screen-state.js";
import type { Theme } from "../scene/palette.js";
import { BookGlyph, MusicGlyph, TourGlyph } from "./icons.js";
import { Legend } from "./Legend.js";
import { ScanField } from "./ScanField.js";
import { SiteTabs } from "./SiteTabs.js";
import { Wordmark } from "./Wordmark.js";

export const GUIDE_BUTTON_TEXT = "What is Sexton?";
export const TOUR_BUTTON_TEXT = "Tour";
export const MUSIC_BUTTON_TEXT = "Music";

export interface HeaderProps {
  /** The scan tag text, or null when nothing is shown (a rejected replay value). */
  readonly tag: string | null;
  /** A repository from the address that waits for a press (10.11), or null. */
  readonly prompt?: string | null;
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
  /** The move to the Home page of the wordmark and the "Overview" tab (spec home-page, 12.1, 12.5). Absent, both are
   * plain links to "/". */
  readonly onWordmark?: () => void;
  /** The "Cemetery" tab's move: the Home action (spec clean-site, 10.2). Absent, the tab is a plain link. */
  readonly onCemetery?: () => void;
  /** Recent scans for the example list (spec home-page, 14.2), the clock for their ages, and Clear. */
  readonly recent?: readonly Entry[];
  readonly now?: () => number;
  readonly onRecentOpen?: () => void;
  readonly onClearRecent?: () => void;
  readonly onGuide: () => void;
  readonly onTour: () => void;
  /** The Music switch, given only when a track is set in the Track slot (1.15, 14.2); absent, no button. */
  readonly music?: { readonly on: boolean; readonly onToggle: () => void };
}

export function Header(props: HeaderProps) {
  const { tag, prompt = null, theme, apiConfigured, fieldRef, popover, onPopover, onScan, onWordmark, onCemetery, recent = [], now = Date.now, onRecentOpen, onClearRecent, onGuide, onTour, music } = props;
  return (
    <header className="site-header">
      <Wordmark {...(onWordmark !== undefined ? { onHome: onWordmark } : {})} />
      <SiteTabs current="cemetery" {...(onWordmark !== undefined ? { onOverview: onWordmark } : {})} {...(onCemetery !== undefined ? { onCemetery } : {})} />
      {tag === null ? null : (
        <p className="scan-tag-wrap">
          <span className="scan-tag">{tag}</span>
        </p>
      )}
      <ScanField
        apiConfigured={apiConfigured}
        {...(fieldRef !== undefined ? { fieldRef } : {})}
        prompt={prompt}
        examplesOpen={popover === "examples"}
        recent={recent}
        now={now}
        {...(onClearRecent !== undefined ? { onClearRecent } : {})}
        onExamples={(open) => {
          if (open) {
            onRecentOpen?.();
            onPopover("examples");
          }
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
        {music === undefined ? null : (
          <button type="button" className="ib ib-music" aria-pressed={music.on} onClick={music.onToggle}>
            <MusicGlyph />
            <span className="ib-text">{MUSIC_BUTTON_TEXT}</span>
          </button>
        )}
        <button type="button" className="ib" data-tour-button onClick={onTour}>
          <TourGlyph />
          <span className="ib-text">{TOUR_BUTTON_TEXT}</span>
        </button>
      </div>
    </header>
  );
}
