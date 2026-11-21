// Fixed note texts a recipe may add. Spec: .kiro/specs/migration-node-sass, Requirements 2.6, 4.4 to 4.6, 6.3.
// The PR body renders a note only when it is one of these.

export const NOTE_SITES_TRUNCATED = "further review sites were not listed";
export const NOTE_SASS_LOADER_RAISED = "sass-loader was raised, check that your webpack version is supported by the new sass-loader";
export const NOTE_SASS_LOADER_UNCHANGED = "sass-loader unchanged, already Dart Sass compatible";
export const NOTE_SASS_LOADER_UNKNOWN = "sass-loader version could not be read, check that it is 7.2.0 or later";
export const NOTE_NOT_SCANNED =
  "stylesheets and scripts were not scanned, search the repository for /deep/ and node-sass render() calls before merging";

export const RECIPE_NOTES: ReadonlySet<string> = new Set([
  NOTE_SITES_TRUNCATED,
  NOTE_SASS_LOADER_RAISED,
  NOTE_SASS_LOADER_UNCHANGED,
  NOTE_SASS_LOADER_UNKNOWN,
  NOTE_NOT_SCANNED,
]);
