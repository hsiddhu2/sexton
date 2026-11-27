// The Reason family of an engine state reason and its plain sentence (spec clean-site, design C3, requirements 3.9 and
// 3.10). Families are keyed by the fixed text of each branch of the engine's state rule; web holds no state rule, it
// only reads the reason. The facts filled into a sentence come only from the reason text, as plain text. Pure.

export type Family =
  | "maintainer"
  | "provenance"
  | "install-script"
  | "new-dependency"
  | "publisher"
  | "deprecated"
  | "stale-advisory"
  | "high"
  | "stale"
  | "low"
  | "unavailable"
  | "none";

interface Row {
  readonly family: Family;
  /** Anchored at both ends; the captured parts are the facts of the sentence. */
  readonly pattern: RegExp;
  readonly sentence: (facts: readonly string[]) => string;
}

const fact = (facts: readonly string[], i: number): string => facts[i] ?? "";

const ROWS: readonly Row[] = [
  { family: "maintainer", pattern: /^maintainer change in the last 90 days$/, sentence: () => "A maintainer of this package changed in the last 90 days." },
  {
    family: "provenance",
    pattern: /^provenance regression: (\S+) has no provenance, (\S+) had it$/,
    sentence: (f) => `${fact(f, 0)} was published without provenance, though ${fact(f, 1)} had it.`,
  },
  {
    family: "install-script",
    pattern: /^install script added in (\S+)$/,
    sentence: (f) => `${fact(f, 0)} added an install script that earlier versions did not have.`,
  },
  {
    family: "new-dependency",
    pattern: /^new dependency in (\S+): (\S+)$/,
    sentence: (f) => `${fact(f, 0)} added a new dependency, ${fact(f, 1)}, that looks risky.`,
  },
  {
    family: "publisher",
    pattern: /^publisher changed in (\S+): (\S+) to (\S+)$/,
    sentence: (f) => `${fact(f, 0)} was published by a different account than before, ${fact(f, 1)} to ${fact(f, 2)}.`,
  },
  { family: "deprecated", pattern: /^installed version is deprecated$/, sentence: () => "The authors have marked this version as deprecated." },
  {
    family: "stale-advisory",
    pattern: /^no release in (\d+) months and an open advisory$/,
    sentence: (f) => `No release in ${fact(f, 0)} months, and a known advisory is still open.`,
  },
  { family: "high", pattern: /^advisory of severity High or Critical$/, sentence: () => "A High or Critical advisory is open." },
  { family: "stale", pattern: /^no release in (\d+) months$/, sentence: (f) => `No release in ${fact(f, 0)} months.` },
  { family: "low", pattern: /^advisory of severity Moderate or Low$/, sentence: () => "A Moderate or Low advisory is open." },
  { family: "unavailable", pattern: /^all state signals unavailable$/, sentence: () => "None of its health signals could be read." },
  { family: "none", pattern: /^no rule matched$/, sentence: () => "No rule matched. Nothing to do." },
];

/** Every family, in the order of the engine's rule. */
export const FAMILIES: readonly Family[] = ROWS.map((r) => r.family);

function match(reason: string): { readonly row: Row; readonly facts: readonly string[] } | null {
  for (const row of ROWS) {
    const m = row.pattern.exec(reason);
    if (m !== null) return { row, facts: m.slice(1) };
  }
  return null;
}

/** Pure. The Reason family of a state reason, or null when it belongs to none. */
export function reasonFamily(reason: string): Family | null {
  return match(reason)?.row.family ?? null;
}

/** Pure. The plain sentence of a reason (3.9), else the reason with its first letter capitalised (3.10). */
export function reasonSentence(reason: string): string {
  const found = match(reason);
  if (found !== null) return found.row.sentence(found.facts);
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
