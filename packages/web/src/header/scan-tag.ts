// The scan tag beside the wordmark (spec clean-site, requirements 1.5, 1.6, 1.7, 1.16 and 1.17). The Fixture name
// never shows: the Sample scan reads "Sample scan", whatever repository its file names. Pure.
import { normaliseRepo } from "./repo-input.js";
import type { ViewSource } from "../load/view-address.js";

export const SAMPLE_TAG = "Sample scan";
export const REPLAY_TAG = "Replay";
export const SCAN_FILE_TAG = "Scan file";

/** Pure. The tag text for the Source on screen, or null for a rejected replay value (nothing is loaded). */
export function scanTag(source: ViewSource): string | null {
  switch (source.kind) {
    case "demo":
      return SAMPLE_TAG;
    case "replay":
      return REPLAY_TAG;
    case "scan":
      return SCAN_FILE_TAG;
    case "repo": {
      const repo = normaliseRepo(source.url);
      return repo.ok ? repo.label : source.url;
    }
    case "rejected":
      return null;
  }
}
