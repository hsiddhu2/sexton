// The repository of the last hosted scan the visitor started in this tab (spec calm-first-visit, 8.17), kept in
// sessionStorage so only a reload of the same tab starts it again. Every access is guarded.

export const SCANNED_KEY = "sexton:scanned";

export function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readScanned(storage: Pick<Storage, "getItem"> | null): string | null {
  try {
    return storage?.getItem(SCANNED_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeScanned(storage: Pick<Storage, "setItem"> | null, url: string): void {
  try {
    storage?.setItem(SCANNED_KEY, url);
  } catch {
    // Storage blocked or full: a reload then waits for a press.
  }
}

/** True when this page load is a reload of the same tab. Any failure gives false. */
export function isReload(): boolean {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type === "reload";
  } catch {
    return false;
  }
}

/** Pure. True when a `repo` from the address may start its scan with no press: a reload after the visitor's own scan. */
export function mayResume(repo: string, scanned: string | null, reload: boolean): boolean {
  return reload && scanned === repo;
}
