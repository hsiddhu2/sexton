// The Scan field's example list (spec clean-site, design C2, requirement 1.9), headed "Try one".
import { claim } from "../copy/claims.js";

export const EXAMPLES_HEADING = "Try one";

export interface Example {
  readonly repo: string;
  readonly note: string;
  /** The one example where Open pull request works; its note is set in the Alive colour. */
  readonly good: boolean;
}

export const EXAMPLES: readonly Example[] = [
  { repo: "hsiddhu2/sexton-demo", note: claim("example.demo"), good: true },
  { repo: "expressjs/express", note: "a popular web framework", good: false },
  { repo: "facebook/react", note: "a large repo", good: false },
];

/** The demo repository of "Try the demo repo" (12.5) and the first example. */
export const DEMO_REPO = "hsiddhu2/sexton-demo";
