// The Sound choice, remembered per browser (spec cemetery-undead-2, requirement 8.3). Every storage access is guarded.

export const SOUND_KEY = "sexton:sound";

/** True only for the stored value "on". A missing storage, a throwing getter or any other value gives false. */
export function readSound(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

/** Stores "on" or "off". A throwing or missing storage is ignored: the choice then lasts for this page only. */
export function writeSound(storage: Pick<Storage, "setItem"> | null, on: boolean): void {
  try {
    storage?.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked or full: keep working.
  }
}
