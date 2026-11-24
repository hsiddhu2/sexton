// Epitaphs: "Here lies <name> <version>" and one short Punchline that is true of the State's reason.
// Spec cemetery-undead, requirement 7, design.md "Epitaph table" (approved by the owner on 24 Nov 2026).
// The reasons are the fixed texts of the Engine's state rule (packages/engine/src/state.ts). Web holds no state rule:
// it only recognises the reason text and picks a line.
import type { State } from "@sexton/api";

export type ReasonFamily =
  | "maintainer-change"
  | "provenance-regression"
  | "install-script"
  | "deprecated"
  | "stale-with-advisory"
  | "severe-advisory"
  | "no-signals"
  | "stale"
  | "minor-advisory"
  | "no-rule";

interface Row {
  readonly state: State;
  readonly family: ReasonFamily;
  /** Anchored at the start; version numbers and month counts are free. */
  readonly pattern: RegExp;
  readonly punchline: string;
}

const ROWS: readonly Row[] = [
  { state: "Possessed", family: "maintainer-change", pattern: /^maintainer change in the last 90 days$/, punchline: "The keys changed hands. Nobody heard the door." },
  { state: "Possessed", family: "provenance-regression", pattern: /^provenance regression: \S+ has no provenance, \S+ had it$/, punchline: "It used to carry papers. This one came without." },
  { state: "Possessed", family: "install-script", pattern: /^install script added in \S+$/, punchline: "It came back with a script, and it runs before you do." },
  { state: "Dead", family: "deprecated", pattern: /^installed version is deprecated$/, punchline: "Deprecated, not departed." },
  { state: "Dead", family: "stale-with-advisory", pattern: /^no release in \d+ months and an open advisory$/, punchline: "Two years without a release, and a hole still open." },
  { state: "Haunted", family: "severe-advisory", pattern: /^advisory of severity High or Critical$/, punchline: "Something serious walks these grounds." },
  { state: "Restless", family: "no-signals", pattern: /^all state signals unavailable$/, punchline: "Nobody could find its records." },
  { state: "Restless", family: "stale", pattern: /^no release in \d+ months$/, punchline: "Two years of silence. It may just be resting." },
  { state: "Restless", family: "minor-advisory", pattern: /^advisory of severity Moderate or Low$/, punchline: "A small advisory keeps it awake." },
  { state: "Alive", family: "no-rule", pattern: /^no rule matched$/, punchline: "Alive and well, as far as the records show." },
];

/** The Reason family of a state reason under its State, or null when the reason is not one the table knows. */
export function reasonFamily(state: State, reason: string): ReasonFamily | null {
  for (const row of ROWS) if (row.state === state && row.pattern.test(reason)) return row.family;
  return null;
}

/** The Punchline for a State and reason, or null. Takes no package name, so it cannot depend on one (7.6). */
export function punchline(state: State, reason: string): string | null {
  for (const row of ROWS) if (row.state === state && row.pattern.test(reason)) return row.punchline;
  return null;
}

/** Every Punchline of the table, in row order. */
export const PUNCHLINES: readonly string[] = ROWS.map((r) => r.punchline);

/** "Here lies <name> <version>". */
export function hereLies(name: string, version: string): string {
  return `Here lies ${name} ${version}`;
}
