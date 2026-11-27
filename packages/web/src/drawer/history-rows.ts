// The History tab of the Drawer (spec clean-site, design C5, requirements 7.17 and 7.18): a package's Segments newest
// first, each with its date, State and plain reason. Web holds no state rule; it only reads the Segments. Pure.
import type { ScanResponse, State } from "@sexton/api";
import { dayText } from "../header/format-scan-time.js";
import { reasonSentence } from "../panel/reason-family.js";
import { timelineOf } from "../time/form-at.js";

export const NO_HISTORY_TEXT = "No history for this scan.";

export interface HistoryRow {
  /** The Segment's start, ISO, for the time element. */
  readonly from: string;
  /** The start as a day, for display. */
  readonly date: string;
  /** Null while the installed version was not published yet. */
  readonly state: State | null;
  readonly reason: string;
}

/** Pure. Null when the response has no timelines or none for this package (7.18). */
export function historyRows(response: ScanResponse, name: string): HistoryRow[] | null {
  const timeline = timelineOf(response, name);
  if (timeline === undefined || timeline.segments.length === 0) return null;
  return timeline.segments
    .map((s): HistoryRow => ({ from: s.from, date: dayText(Date.parse(s.from)), state: s.state, reason: reasonSentence(s.reason) }))
    .reverse();
}
