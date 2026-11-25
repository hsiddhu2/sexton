// Serious mode: hides every Punchline, keeps the reason, the Characters and the Forms.
// Spec cemetery-undead, requirement 8. Remembered per browser; every storage access is guarded.

export const SERIOUS_KEY = "sexton:serious";

/** True only for the stored value "on". A missing storage, a throwing getter or any other value gives false. */
export function readSerious(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(SERIOUS_KEY) === "on";
  } catch {
    return false;
  }
}

/** Stores "on" or "off". A throwing or missing storage is ignored: the choice then lasts for this page only. */
export function writeSerious(storage: Pick<Storage, "setItem"> | null, on: boolean): void {
  try {
    storage?.setItem(SERIOUS_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked or full: keep working.
  }
}

/** window.localStorage, or null when reading the property itself throws (some privacy modes). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
