import type { ReplayInfo } from "@sexton/api";

export const REPLAY_BANNER_TEXT = "Reconstructed from public reports. Not a live scan.";

/** A link only for an address that starts with https:// and holds no white space or control character. */
export function isSafeSourceUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- the point is to reject control characters
  return url.startsWith("https://") && !/[\s\u0000-\u001f\u007f]/.test(url);
}

export interface ReplayBannerProps {
  readonly replay: ReplayInfo;
  /** The card over the scene shows the chosen Stop's date first (K2d fix 1). */
  readonly date?: string;
  /** The card over the scene: the scrubber captions sit in it while a replay shows its Stop cards. */
  readonly notes?: readonly string[];
  readonly className?: string;
}

/** The note that every replay screen carries. Text only, links only for https addresses (requirement 19). */
export function ReplayBanner({ replay, date, notes = [], className }: ReplayBannerProps) {
  return (
    <aside role="note" className={className === undefined ? "replay-banner" : `replay-banner ${className}`}>
      {date === undefined ? null : <p className="replay-date">{date}</p>}
      <p className="replay-title">
        <strong>{replay.title}</strong>
      </p>
      <p className="replay-notlive">{REPLAY_BANNER_TEXT}</p>
      <p className="replay-summary">{replay.summary}</p>
      <ul className="replay-sources">
        {replay.sources.map((source, i) => (
          <li key={i}>
            {isSafeSourceUrl(source.url) ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.label}
              </a>
            ) : (
              source.label
            )}
          </li>
        ))}
      </ul>
      {notes.map((note) => (
        <p key={note} className="scrub-note">
          {note}
        </p>
      ))}
    </aside>
  );
}
