// The page's history entries (spec calm-first-visit, requirement 8). Every call is guarded: in a frame that refuses
// the history API the View still changes and the address does not.
import { formatView, type View } from "./view-address.js";

export interface EntryState {
  readonly sexton: 1;
  /** True when opening the drawer added this entry, so closing it goes back one entry (8.4). */
  readonly drawerPushed: boolean;
}

function urlOf(view: View): string {
  return `${window.location.pathname}${formatView(view)}${window.location.hash}`;
}

export function pushEntry(view: View, drawerPushed = false): void {
  try {
    window.history.pushState({ sexton: 1, drawerPushed } satisfies EntryState, "", urlOf(view));
  } catch {
    // History refused: keep the View.
  }
}

export function replaceEntry(view: View, drawerPushed = false): void {
  try {
    window.history.replaceState({ sexton: 1, drawerPushed } satisfies EntryState, "", urlOf(view));
  } catch {
    // History refused: keep the View.
  }
}

/** True when the current entry was added by opening the drawer. */
export function currentDrawerPushed(): boolean {
  try {
    const state = window.history.state as Partial<EntryState> | null;
    return state?.sexton === 1 && state.drawerPushed === true;
  } catch {
    return false;
  }
}
