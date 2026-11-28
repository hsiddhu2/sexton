// The header and Footer bar glyphs, as spec clean-site sets them. Decorative: every one is aria-hidden and
// its button carries the name.
import type { ReactElement } from "react";

interface GlyphProps {
  readonly className?: string;
}

function Glyph({ className, children }: GlyphProps & { readonly children: ReactElement | readonly ReactElement[] }): ReactElement {
  return (
    <svg
      className={className ?? "glyph"}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The wordmark glyph: an arched headstone with a cross. */
export function MarkGlyph(): ReactElement {
  return (
    <Glyph className="wordmark-glyph">
      <path d="M6 21V10a6 6 0 0 1 12 0v11M3 21h18M12 9v6M9.5 11.5h5" />
    </Glyph>
  );
}

export function SearchGlyph(): ReactElement {
  return (
    <Glyph className="scan-glyph">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Glyph>
  );
}

export function BookGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 0 2 2h13v-4" />
    </Glyph>
  );
}

export function ListGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Glyph>
  );
}

export function TourGlyph(): ReactElement {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
    </Glyph>
  );
}

export function MusicGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </Glyph>
  );
}

export function PlayGlyph(): ReactElement {
  return (
    <svg className="glyph" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path className="glyph-fill" d="M8 5v14l11-7z" />
    </svg>
  );
}

export function CloseGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M6 6l12 12M18 6 6 18" />
    </Glyph>
  );
}
