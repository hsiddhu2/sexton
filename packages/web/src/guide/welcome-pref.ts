// The Welcome bar's stored choice (spec clean-site, design C7, requirements 9.5 to 9.8): `sexton:welcome` in
// localStorage, and only the value "closed" is ever written or read. Every access is in try/catch; with no storage
// the bar stays closed for the rest of the page load once closed, and no error shows.

export const WELCOME_KEY = "sexton:welcome";
export const WELCOME_CLOSED = "closed";

/** Gives the storage to use, or throws when the browser refuses it. */
export type StorageGetter = () => Pick<Storage, "getItem" | "setItem">;

const pageStorage: StorageGetter = () => window.localStorage;

/** Closed in this page load, whatever storage said or could keep. */
let closedThisLoad = false;

/** True when the Welcome bar should stay hidden: closed in this page load, or "closed" is stored. */
export function welcomeClosed(storage: StorageGetter = pageStorage): boolean {
  if (closedThisLoad) return true;
  try {
    return storage().getItem(WELCOME_KEY) === WELCOME_CLOSED;
  } catch {
    return false;
  }
}

/** Hides the bar for this page load and stores "closed" where storage allows it. */
export function closeWelcome(storage: StorageGetter = pageStorage): void {
  closedThisLoad = true;
  try {
    storage().setItem(WELCOME_KEY, WELCOME_CLOSED);
  } catch {
    // Storage is unavailable: the bar stays hidden for this page load only (9.8).
  }
}

/** Tests only: forget the choice made in this page load. */
export function resetWelcomeForTests(): void {
  closedThisLoad = false;
}
