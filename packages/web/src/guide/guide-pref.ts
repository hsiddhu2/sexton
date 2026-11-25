// The Guide is remembered per browser as "closed" (spec judge-path, requirements 1.7 and 1.8). Every access is guarded.

export const GUIDE_KEY = "sexton:guide";
export const GUIDE_CLOSED = "closed";

/** True only for the stored value "closed". A missing storage, a throwing getter or any other value gives false. */
export function readGuideClosed(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(GUIDE_KEY) === GUIDE_CLOSED;
  } catch {
    return false;
  }
}

/** Stores "closed". A throwing or missing storage is ignored: the Guide then stays closed for this page only. */
export function writeGuideClosed(storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(GUIDE_KEY, GUIDE_CLOSED);
  } catch {
    // Storage blocked or full: keep working.
  }
}

let allowed = true;

/** False only in unit tests that do not test the Guide: it never opens by itself there. */
export function guideMayOpenByItself(): boolean {
  return allowed;
}

/** Tests only: sets whether the Guide may open by itself on this page. */
export function setGuideAllowedForTests(value: boolean): void {
  allowed = value;
}
