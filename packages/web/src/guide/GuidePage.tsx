// The Guide page (spec clean-site, design C7, requirement 9): the two-minute guide in plain words, in place of Home,
// with the breadcrumb "← Cemetery / What is Sexton?". Its sentences come from guide/guide-content.ts and through it
// from the Claim registry; Terms are marked in the answers (11.2).
import { Fragment, type ReactNode } from "react";
import type { Term } from "../glossary/glossary.js";
import { TermText } from "../glossary/TermText.js";
import { GravePicture } from "../scene/GravePicture.js";
import type { Theme } from "../scene/palette.js";
import {
  CODE_WORDS,
  GRAVES,
  GRAVES_HEADING,
  GUIDE_ATTACK,
  GUIDE_CRUMB,
  GUIDE_EYEBROW,
  GUIDE_HEADLINE,
  GUIDE_HOME,
  GUIDE_LEAD,
  PROBLEM,
  PROBLEM_HEADING,
  QUESTIONS,
  QUESTIONS_HEADING,
  STEPS,
  STEPS_HEADING,
} from "./guide-content.js";

export { GUIDE_CRUMB, GUIDE_EYEBROW, GUIDE_HEADLINE, GUIDE_LEAD } from "./guide-content.js";

export interface GuidePageProps {
  readonly theme: Theme;
  readonly onHome: () => void;
  readonly onAttack: () => void;
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
}

const CODE_PATTERN = new RegExp(`(${CODE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})`);

/** Running text with its code words in <code> and its Terms marked. */
function Answer({ text, onTerm }: { readonly text: string; readonly onTerm?: GuidePageProps["onTerm"] }): ReactNode {
  return text.split(CODE_PATTERN).map((part, i) =>
    CODE_WORDS.includes(part) ? (
      <code key={i}>{part}</code>
    ) : (
      <Fragment key={i}>
        <TermText text={part} {...(onTerm !== undefined ? { onTerm } : {})} />
      </Fragment>
    ),
  );
}

export function GuidePage({ theme, onHome, onAttack, onTerm }: GuidePageProps) {
  return (
    <main className="guide">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="crumb-home" onClick={onHome}>
          ← Cemetery
        </button>
        <span aria-hidden="true">/</span>
        <span className="crumb-here">{GUIDE_CRUMB}</span>
      </nav>
      <p className="eyebrow">{GUIDE_EYEBROW}</p>
      <h1 className="guide-headline">{GUIDE_HEADLINE}</h1>
      <p className="guide-lead">{GUIDE_LEAD}</p>

      <h2 className="guide-heading">{PROBLEM_HEADING}</h2>
      {PROBLEM.map((text) => (
        <p key={text} className="guide-text">
          {text}
        </p>
      ))}

      <h2 className="guide-heading">{STEPS_HEADING}</h2>
      <ol className="guide-steps">
        {STEPS.map((step) => (
          <li key={step.label} className="guide-step">
            <span className="guide-step-label">{step.label}</span>
            <h3 className="guide-step-title">{step.title}</h3>
            <p className="guide-step-text">{step.text}</p>
          </li>
        ))}
      </ol>

      <h2 className="guide-heading">{GRAVES_HEADING}</h2>
      <ul className="guide-graves">
        {GRAVES.map(({ state, meaning }) => (
          <li key={state} className="guide-grave">
            <GravePicture kind={state} theme={theme} height={66} />
            <span className={`badge badge-${state.toLowerCase()}`}>
              <span className="badge-dot" aria-hidden="true" />
              {state}
            </span>
            <span className="guide-grave-meaning">{meaning}</span>
          </li>
        ))}
      </ul>

      <h2 className="guide-heading">{QUESTIONS_HEADING}</h2>
      {QUESTIONS.map(({ question, answer }) => (
        <section key={question} className="guide-qa" aria-label={question}>
          <h3 className="guide-question">{question}</h3>
          <p className="guide-answer">
            <Answer text={answer} {...(onTerm !== undefined ? { onTerm } : {})} />
          </p>
        </section>
      ))}

      <p className="guide-buttons">
        <button type="button" className="button button-primary" onClick={onHome}>
          {GUIDE_HOME}
        </button>
        <button type="button" className="button" onClick={onAttack}>
          {GUIDE_ATTACK}
        </button>
      </p>
    </main>
  );
}
