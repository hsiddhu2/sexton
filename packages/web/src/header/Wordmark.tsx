import type { MouseEvent } from "react";
import { MarkGlyph } from "./icons.js";

/** The wordmark's accessible name (spec home-page, 12.2). */
export const WORDMARK_NAME = "Sexton, home page";

/** Pure. True for a plain primary press, which the Site follows without a reload; a modified press follows the link. */
export function isPlainPress(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export interface WordmarkProps {
  /** The move to the Home page at "/" (spec home-page, 12.1), taken on a plain primary press; a modified press follows the link. */
  readonly onHome?: () => void;
}

/** The click handler of the wordmark and the tabs: `onHome` on a plain primary press, the link followed otherwise. */
export function homeClick(onHome: (() => void) | undefined) {
  return (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onHome === undefined || !isPlainPress(event)) return;
    event.preventDefault();
    onHome();
  };
}

/** The wordmark: a link to the Home page at "/", followed without a reload when `onHome` is given (spec home-page, 12.1). */
export function Wordmark({ onHome }: WordmarkProps) {
  const onClick = homeClick(onHome);
  return (
    <a className="wordmark" href="/" aria-label={WORDMARK_NAME} onClick={onClick}>
      <MarkGlyph />
      <span className="wordmark-name">Sexton</span>
    </a>
  );
}
