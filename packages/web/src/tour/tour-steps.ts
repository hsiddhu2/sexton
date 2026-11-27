// The three Tour steps (spec clean-site, design C11, requirements 13.3 and 13.4): each a target, a title and a
// sentence, the texts from the Claim registry. Pure data.
import { claim } from "../copy/claims.js";

export interface TourStepDef {
  /** The `data-tour` value of the part the step highlights. */
  readonly target: "scene" | "inspector" | "scan";
  readonly title: string;
  readonly text: string;
}

export const TOUR_STEPS: readonly [TourStepDef, TourStepDef, TourStepDef] = [
  { target: "scene", title: claim("tour.1.title"), text: claim("tour.1.text") },
  { target: "inspector", title: claim("tour.2.title"), text: claim("tour.2.text") },
  { target: "scan", title: claim("tour.3.title"), text: claim("tour.3.text") },
];

/** The third step's sentence while no API base is configured (13.4). */
export const TOUR_OFF_TEXT = claim("tour.3.off");
