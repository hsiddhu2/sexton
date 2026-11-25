// The Fix-first line (spec judge-path, requirement 2): the first grave in triage order, its State and its reason.
import type { ScanResponse, State } from "@sexton/api";
import { triageOrder } from "../triage/triage.js";

export type FixFirst =
  | { readonly kind: "grave"; readonly index: 0; readonly name: string; readonly version: string; readonly state: State; readonly reason: string }
  | { readonly kind: "all-alive" }
  | null;

export const ALL_ALIVE_TEXT = "Nothing to fix first: every dependency is Alive.";

/** Pure. Null for a replay or a scan with no packages; "all-alive" when every package is Alive; else triage index 0. */
export function fixFirst(response: ScanResponse): FixFirst {
  if (response.replay !== undefined) return null;
  const order = triageOrder(response.report.packages);
  const top = order[0];
  if (top === undefined) return null;
  if (top.state === "Alive") return { kind: "all-alive" };
  return { kind: "grave", index: 0, name: top.name, version: top.installedVersion, state: top.state, reason: top.stateReason };
}

/** Pure. The line's text. */
export function fixFirstText(f: Exclude<FixFirst, null>): string {
  return f.kind === "all-alive" ? ALL_ALIVE_TEXT : `Fix first: ${f.name} ${f.version}, ${f.state}, ${f.reason}`;
}
