// Running text with its Terms marked (spec clean-site, design C9, requirements 11.2, 11.3 and 11.7). Used only for
// running text and signal labels, never inside a button, link, breadcrumb, heading or column heading.
import { Fragment, type ReactElement } from "react";
import { markTerms, type Term } from "./glossary.js";

export interface TermTextProps {
  readonly text: string;
  /** Called with the Term and the pressed button, which anchors the Term Pop-over. */
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
}

export function TermText({ text, onTerm }: TermTextProps): ReactElement {
  return (
    <>
      {markTerms(text).map((part, i) =>
        "term" in part ? (
          <button
            key={i}
            type="button"
            className="term"
            data-term={part.term}
            onClick={(event) => {
              onTerm?.(part.term, event.currentTarget);
            }}
          >
            {part.text}
          </button>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
