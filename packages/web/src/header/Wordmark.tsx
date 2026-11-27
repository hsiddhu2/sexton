import type { MouseEvent } from "react";
import { MarkGlyph } from "./icons.js";

export interface WordmarkProps {
  /** The Home action (spec clean-site, 10.2), taken on a plain primary press; a modified press follows the link. */
  readonly onHome?: () => void;
}

/** The wordmark: a link to "/" that takes the Home action without a reload (spec clean-site, design C2). */
export function Wordmark({ onHome }: WordmarkProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onHome === undefined || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onHome();
  };
  return (
    <a className="wordmark" href="/" aria-label="Sexton, back to the cemetery" onClick={onClick}>
      <MarkGlyph />
      <span className="wordmark-name">Sexton</span>
    </a>
  );
}
