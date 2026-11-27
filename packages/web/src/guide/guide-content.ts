// The Guide page's structure (spec clean-site, design C7, requirements 9.2 and 9.4): its headings and labels here,
// every sentence that says what Sexton is or does from the Claim registry. Pure data.
import type { State } from "@sexton/api";
import { claim } from "../copy/claims.js";
import { STATES } from "../load/lists.js";

export const GUIDE_CRUMB = "What is Sexton?";
export const GUIDE_EYEBROW = "The two-minute guide";
export const GUIDE_HEADLINE = "Sexton looks after the code your app borrows.";
export const GUIDE_LEAD = claim("guide.lead");
export const GUIDE_HOME = "Go to the cemetery";
export const GUIDE_ATTACK = "Watch a real attack";

export const PROBLEM_HEADING = "The problem, in plain words";
export const PROBLEM: readonly string[] = [claim("guide.problem.1"), claim("guide.problem.2")];

export const STEPS_HEADING = "What Sexton does";
export interface GuideStep {
  readonly label: string;
  readonly title: string;
  readonly text: string;
}
export const STEPS: readonly [GuideStep, GuideStep, GuideStep] = [
  { label: "Step 1", title: claim("guide.step.1.title"), text: claim("guide.step.1.text") },
  { label: "Step 2", title: claim("guide.step.2.title"), text: claim("guide.step.2.text") },
  { label: "Step 3", title: claim("guide.step.3.title"), text: claim("guide.step.3.text") },
];

export const GRAVES_HEADING = "What the five graves mean";
export const GRAVES: readonly { readonly state: State; readonly meaning: string }[] = STATES.map((state) => ({
  state,
  meaning: claim(`state.${state}`),
}));

export const QUESTIONS_HEADING = "Questions people ask";
/** The heading over the track's full credit, word for word (14.6). */
export const MUSIC_HEADING = "Music";
export interface GuideAnswer {
  readonly question: string;
  readonly answer: string;
}
/** The five answers of 9.2, in order: what a pull request is, sign-in, how it opens, automatic checks, the proof. */
export const QUESTIONS: readonly GuideAnswer[] = [
  { question: "What is a pull request?", answer: claim("guide.answer.pull-request") },
  { question: "Do I have to sign in to GitHub?", answer: claim("guide.answer.sign-in") },
  { question: "So how does the pull request get opened?", answer: claim("guide.answer.how-opened") },
  { question: "Can it check my repo automatically?", answer: claim("guide.answer.automatic") },
  { question: "How do I know it is telling the truth?", answer: claim("guide.answer.proof") },
];

/** Words in an answer shown in the monospace stack (5.5). */
export const CODE_WORDS: readonly string[] = ["sexton check", "hsiddhu2/sexton-demo"];
