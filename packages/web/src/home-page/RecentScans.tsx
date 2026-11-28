// Recent scans (spec home-page, design C6, requirement 14): the Entries of the scan cache, newest first, each with
// its age, and Clear. Renders nothing for an empty list (14.5). Used on the Home page and in the header example list.
import { useId } from "react";
import { ageText, type Entry } from "../cache/scan-cache.js";

export const RECENT_HEADING = "Recent scans";
export const CLEAR_TEXT = "Clear";

export interface RecentScansProps {
  readonly entries: readonly Entry[];
  readonly now: number;
  /** Takes the owner/name of the row pressed (14.3). */
  readonly onPick: (label: string) => void;
  readonly onClear: () => void;
  readonly className?: string;
}

export function RecentScans({ entries, now, onPick, onClear, className = "recent" }: RecentScansProps) {
  const headingId = useId();
  if (entries.length === 0) return null;
  return (
    <div className={className} role="group" aria-labelledby={headingId}>
      <div className="recent-head">
        <p id={headingId} className="recent-heading">
          {RECENT_HEADING}
        </p>
        <button type="button" className="recent-clear" onClick={onClear}>
          {CLEAR_TEXT}
        </button>
      </div>
      <ul className="recent-list">
        {entries.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              className="recent-row"
              onClick={() => {
                onPick(entry.label);
              }}
            >
              <span className="recent-repo">{entry.label}</span>
              <span className="recent-age">{ageText(now - entry.savedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
