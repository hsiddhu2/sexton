// The Load moment plays once per page load (spec cemetery-undead-2, requirement 11.3).

let played = false;

/** True the first time it is called on a page, false after. */
export function claimLoadMoment(): boolean {
  if (played) return false;
  played = true;
  return true;
}

/** Tests only: sets whether the Load moment has played on this page. */
export function setLoadMomentPlayedForTests(value: boolean): void {
  played = value;
}
