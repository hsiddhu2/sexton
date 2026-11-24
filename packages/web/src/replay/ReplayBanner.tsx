import type { ReplayInfo } from "@sexton/api";

export const REPLAY_BANNER_TEXT = "Reconstructed from public reports. Not a live scan.";

/** A link only for an address that starts with https:// and holds no white space or control character. */
export function isSafeSourceUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- the point is to reject control characters
  return url.startsWith("https://") && !/[\s\u0000-\u001f\u007f]/.test(url);
}

/** The note that every replay screen carries. Text only, links only for https addresses (requirement 19). */
export function ReplayBanner({ replay }: { readonly replay: ReplayInfo }) {
  return (
    <aside role="note" className="replay-banner">
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
    </aside>
  );
}
