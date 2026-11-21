// Review comments from review sites. Spec: .kiro/specs/migration-node-sass, Requirements 5.5, 5.7. Pure.
// Fixed templates; the excerpt appears only through escapeField.

import type { ReviewComment, ReviewSite } from "../types.js";
import { escapeField as F } from "./escape-field.js";

export const DEEP_COMBINATOR_COMMENT =
  "Sexton: this line uses the `/deep/` combinator, which Dart Sass does not support. Replace it by hand, for example with `::v-deep` or `:deep()`. Line: ";
export const LEGACY_RENDER_COMMENT = "Sexton: this file calls the legacy node-sass `render()` API. Check the call against the sass JavaScript API before merging. Line: ";
export const SCRIPT_COMMENT_START = "Sexton: the script ";
export const SCRIPT_COMMENT_END = " runs node-sass, which this branch removes. Change it to the `sass` command line.";

function body(site: ReviewSite): string {
  switch (site.rule) {
    case "deep-combinator":
      return `${DEEP_COMBINATOR_COMMENT}${F(site.excerpt)}`;
    case "legacy-render":
      return `${LEGACY_RENDER_COMMENT}${F(site.excerpt)}`;
    case "node-sass-script":
      return `${SCRIPT_COMMENT_START}${F(site.excerpt)}${SCRIPT_COMMENT_END}`;
  }
}

export function reviewComments(sites: readonly ReviewSite[]): ReviewComment[] {
  return sites.map((site) => ({ path: site.path, line: site.line, body: body(site) }));
}
