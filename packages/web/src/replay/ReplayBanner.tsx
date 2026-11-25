import type { ReplayInfo } from "@sexton/api";

export const REPLAY_BANNER_TEXT = "Reconstructed from public reports. Not a live scan.";
export const SOURCES_LEAD = "Sources:";

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
      {/* One line, as in the mockup: "Sources:" then the sources, separated by commas (spec cemetery-undead-2, A6). */}
      <p className="replay-sources">
        {SOURCES_LEAD}
        {replay.sources.map((source, i) => (
          <span key={i} className="replay-source">
            {i === 0 ? " " : ", "}
            {isSafeSourceUrl(source.url) ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.label}
              </a>
            ) : (
              source.label
            )}
          </span>
        ))}
      </p>
      {notes.map((note) => (
        <p key={note} className="scrub-note">
          {note}
        </p>
      ))}
    </aside>
  );
}
