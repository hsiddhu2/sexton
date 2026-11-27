// A Term's meaning as a Pop-over beside it, inside the viewport (spec clean-site, design C9, requirements 11.4 and
// 11.5). This first version is placed under or over its Term; task 5 refines it with the Drawer.
import type { CSSProperties } from "react";
import { MEANING, type Term } from "./glossary.js";

export const TERM_POP_WIDTH = 280;
const MARGIN = 10;

export interface TermAnchor {
  readonly term: Term;
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

/** Pure. The Pop-over's place: under the Term, else over it, never past the viewport's sides. */
export function termPlace(anchor: TermAnchor, viewport: { readonly width: number; readonly height: number }, height = 96): CSSProperties {
  const width = Math.min(TERM_POP_WIDTH, Math.max(0, viewport.width - 2 * MARGIN));
  const left = Math.max(MARGIN, Math.min(anchor.left, viewport.width - width - MARGIN));
  const below = anchor.bottom + 8;
  const top = below + height > viewport.height ? Math.max(MARGIN, anchor.top - height - 8) : below;
  return { left, top, width };
}

export function TermPopover({ anchor }: { readonly anchor: TermAnchor }) {
  const style = termPlace(anchor, { width: window.innerWidth, height: window.innerHeight });
  return (
    <div className="term-pop" role="note" data-popover="term" style={style}>
      <b className="term-pop-name">{anchor.term}</b>
      <span>{MEANING[anchor.term]}</span>
    </div>
  );
}
