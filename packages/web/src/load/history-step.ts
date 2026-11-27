// What one screen change does to the page's history (spec clean-site, design C8, requirements 10.7, 10.8, 10.14 to
// 10.17). Pure: load/use-view.ts applies the answer to window.history.
import type { ScreenEvent, ScreenState } from "./screen-state.js";
import { formatView, isHomeSource, sameSource } from "./view-address.js";

/**
 * - "push": a new entry (a new Source, the Guide page, a Replay, the List switch, the Home action from a Replay or the
 *   Guide page). Over an entry the Drawer added, the use-view hook replaces that entry instead (design C8).
 * - "drawer": a new entry marked as the Drawer's own (10.15).
 * - "back": the Drawer closed onto the view beneath it; the hook goes back over the Drawer's entry (10.17).
 * - "replace": the current entry changes in place (the scrubber, 10.8).
 * - "none": the address stays as it is (a filter, a Pop-over, the Tour, a Step or a tab, 10.16).
 */
export type HistoryStep = "push" | "drawer" | "back" | "replace" | "none";

/** Pure. The history step of the change from `prev` to `next` that `event` caused. `restore` never writes history. */
export function historyStep(prev: ScreenState, next: ScreenState, event: ScreenEvent): HistoryStep {
  if (event.kind === "restore") return "none";
  if (formatView(prev.view) === formatView(next.view)) return "none";
  if (event.kind === "open-drawer") return "drawer";
  const a = prev.view;
  const b = next.view;
  const sameHome = sameSource(a.source, b.source) && isHomeSource(b.source) && a.page === "home" && b.page === "home";
  // The Drawer closed and the view beneath it shows: a close, Escape, the wordmark or the Tour from an open Drawer.
  if (a.grave !== null && b.grave === null && sameHome && a.list === b.list) return "back";
  if (event.kind === "date") return "replace";
  if (!sameSource(a.source, b.source) || a.page !== b.page || a.list !== b.list) return "push";
  return "replace";
}
