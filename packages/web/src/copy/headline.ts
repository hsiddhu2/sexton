// The Home headline's words (spec clean-site, design C3, requirements 2.1 to 2.3 and 2.16): every text the headline
// can show, word for word. None names a capability, so the Claim registry check of C7 is unchanged. Pure.

/** 2.1: the number is set apart in the Possessed colour; this is the rest of the line. */
export function possessedText(possessed: number, total: number): string {
  return ` of ${String(total)} dependencies ${possessed === 1 ? "needs" : "need"} you now.`;
}

/** 2.16: no Possessed package, but <k> Dead or Haunted ones. */
export function needFixingText(k: number, total: number): string {
  return `Nothing is possessed. ${String(k)} of ${String(total)} ${k === 1 ? "needs" : "need"} fixing.`;
}

/** 2.17: no Possessed, Dead or Haunted package, but the policy fails on <r> rules. */
export function policyFailsText(r: number): string {
  return `Nothing is possessed. The policy fails on ${String(r)} ${r === 1 ? "rule" : "rules"}.`;
}

/** 2.2: the all-clear. Only when nothing is Possessed, Dead or Haunted and the policy passes. */
export const ALL_CLEAR_TEXT = "Nothing needs you now.";

/** 2.3: at an earlier date. */
export function pastPossessedText(total: number, date: string): string {
  return ` of ${String(total)} dependencies needed you on ${date}.`;
}

/** 2.3: at an earlier date with nothing Possessed. */
export function pastNothingText(date: string): string {
  return `Nothing needed you on ${date}.`;
}
