// The Tour (spec clean-site, design C11, requirement 13.3, 13.4, 13.7, 13.9 and 13.10). This first version shows the
// three steps one at a time in a card with Skip and Next, and Done on step 3. The spotlight, the dimming, the
// press blocker and the card placement of tour/place-card.ts land with task 7.
import type { TourStep } from "../load/screen-state.js";

export interface TourStepText {
  readonly title: string;
  readonly text: string;
}

export const TOUR_STEPS: readonly [TourStepText, TourStepText, TourStepText] = [
  { title: "Every grave is one dependency", text: "Its shape tells you its health. The worst ones stand in the front row." },
  { title: "One panel, always in the same place", text: "Hover a grave and its details show here. Nothing floats over the graves." },
  {
    title: "Scan your own repo",
    text: "Paste a public GitHub repo with a package.json at the top. Sexton reads it and builds its cemetery. No sign-in needed.",
  },
];
export const TOUR_OFF_TEXT = "Scanning is off in this build. The hosted site scans public GitHub repos with a package.json at the top.";

export interface TourProps {
  readonly step: TourStep;
  readonly apiConfigured: boolean;
  readonly onNext: () => void;
  readonly onEnd: () => void;
}

export function Tour({ step, apiConfigured, onNext, onEnd }: TourProps) {
  const shown = TOUR_STEPS[step];
  const text = step === 2 && !apiConfigured ? TOUR_OFF_TEXT : shown.text;
  return (
    <section className="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      <p className="eyebrow">Step {step + 1} of 3</p>
      <h2 id="tour-title" className="tour-title">
        {shown.title}
      </h2>
      <p className="tour-text">{text}</p>
      <p className="tour-buttons">
        <button type="button" className="button" onClick={onEnd}>
          Skip
        </button>
        <button type="button" className="button button-primary" onClick={step === 2 ? onEnd : onNext}>
          {step === 2 ? "Done" : "Next"}
        </button>
      </p>
    </section>
  );
}
