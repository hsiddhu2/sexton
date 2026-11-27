// The screen state (spec clean-site, design C1, requirement 17): one View owner, at most one Pop-over on top, and the
// Home action in one step. Every overlay renders from this state and from nothing else. Pure.
import type { State } from "@sexton/api";
import type { ReplayId } from "../replay/replay-ids.js";
import { canonicalView, isHomeSource, type HomeSource, type View, type ViewSource } from "./view-address.js";

export type ViewOwner = "none" | "drawer" | "replay" | "guide" | "tour";
export type Popover = "none" | "legend" | "attacks" | "examples" | "term";
export type TourStep = 0 | 1 | 2;

export interface ScreenState {
  readonly view: View;
  readonly owner: ViewOwner;
  readonly popover: Popover;
  readonly filter: State | null;
  /** The last demo, repo or scan Source shown; the demo at first. */
  readonly homeSource: HomeSource;
  /** The Graveyard or List choice last made on Home. */
  readonly homeList: boolean;
  readonly tourStep: TourStep | null;
}

/**
 * The caller dispatches `open-drawer` only for a grave the loaded scan holds (design C1: an `open-drawer` for a grave
 * the scan lacks is ignored); the reducer does not see the scan.
 */
export type ScreenEvent =
  | { readonly kind: "open-drawer"; readonly grave: string }
  | { readonly kind: "open-replay"; readonly id: ReplayId }
  | { readonly kind: "open-guide" }
  | { readonly kind: "open-tour" }
  | { readonly kind: "open-popover"; readonly popover: Exclude<Popover, "none"> }
  | { readonly kind: "close-popover" }
  | { readonly kind: "close" }
  | { readonly kind: "escape" }
  | { readonly kind: "home" }
  | { readonly kind: "list"; readonly on: boolean }
  | { readonly kind: "filter"; readonly state: State | null }
  | { readonly kind: "date"; readonly at: string | null }
  | { readonly kind: "tour-next" }
  | { readonly kind: "source"; readonly source: ViewSource }
  | { readonly kind: "restore"; readonly view: View };

export type ScreenEventKind = ScreenEvent["kind"];

const DEMO: HomeSource = { kind: "demo" };

/** The View owner a View shows when no Tour runs. */
function ownerOfView(view: View): ViewOwner {
  if (view.source.kind === "replay") return "replay";
  if (view.page === "guide") return "guide";
  if (view.grave !== null) return "drawer";
  return "none";
}

/** True while Home is shown: a demo, repo or scan Source on the home page (a Drawer may sit on it). */
function onHome(s: ScreenState): boolean {
  return isHomeSource(s.view.source) && s.view.page === "home";
}

/** Pure. The Home start: the home Source on the home page with the last Graveyard or List choice, no grave, no date. */
export function homeOf(s: ScreenState): View {
  return { source: s.homeSource, page: "home", list: s.homeList, grave: null, at: null };
}

function goHome(s: ScreenState): ScreenState {
  return { ...s, view: homeOf(s), owner: "none", popover: "none", filter: null, tourStep: null };
}

function replayState(s: ScreenState, id: ReplayId): ScreenState {
  return {
    ...s,
    view: { source: { kind: "replay", id }, page: "home", list: false, grave: null, at: null },
    owner: "replay",
    popover: "none",
    filter: null,
    tourStep: null,
  };
}

function loadSource(s: ScreenState, source: ViewSource): ScreenState {
  if (source.kind === "replay") return replayState(s, source.id);
  const cleared = { ...s, owner: "none" as const, popover: "none" as const, filter: null, tourStep: null };
  if (source.kind === "rejected") return { ...cleared, view: { source, page: "home", list: false, grave: null, at: null } };
  return { ...cleared, homeSource: source, view: { source, page: "home", list: s.homeList, grave: null, at: null } };
}

function restore(s: ScreenState, raw: View): ScreenState {
  const view = canonicalView(raw);
  const home = isHomeSource(view.source) && view.page === "home";
  return {
    view,
    owner: ownerOfView(view),
    popover: "none",
    filter: home ? s.filter : null,
    homeSource: isHomeSource(view.source) ? view.source : s.homeSource,
    homeList: home ? view.list : s.homeList,
    tourStep: null,
  };
}

/** Pure. The next screen state; an event with no effect under the current state returns `s` itself. */
export function reduce(s: ScreenState, e: ScreenEvent): ScreenState {
  const tour = s.tourStep !== null;
  switch (e.kind) {
    case "open-drawer":
      if (!onHome(s) || tour) return s;
      return { ...s, view: { ...s.view, grave: e.grave }, owner: "drawer", popover: "none" };
    case "open-replay":
      return replayState(s, e.id);
    case "open-guide":
      return {
        ...s,
        view: { source: s.homeSource, page: "guide", list: false, grave: null, at: null },
        owner: "guide",
        popover: "none",
        filter: null,
        tourStep: null,
      };
    case "open-tour": {
      const home = goHome(s);
      return { ...home, view: { ...home.view, list: false }, homeList: false, owner: "tour", tourStep: 0 };
    }
    case "open-popover":
      if (tour) return s;
      return s.popover === e.popover ? s : { ...s, popover: e.popover };
    case "close-popover":
      return s.popover === "none" ? s : { ...s, popover: "none" };
    case "close":
      if (s.owner === "drawer") return { ...s, view: { ...s.view, grave: null }, owner: "none", popover: "none" };
      if (s.owner === "tour") return { ...s, owner: "none", popover: "none", tourStep: null };
      return s;
    case "escape":
      if (s.popover !== "none") return { ...s, popover: "none" };
      if (s.owner === "tour") return { ...s, owner: "none", tourStep: null };
      if (s.owner === "drawer") return { ...s, view: { ...s.view, grave: null }, owner: "none" };
      if (s.owner === "replay" || s.owner === "guide") return goHome(s);
      return s;
    case "home":
      return goHome(s);
    case "list":
      if (!onHome(s) || tour) return s;
      return { ...s, view: { ...s.view, list: e.on }, homeList: e.on };
    case "filter":
      if (!onHome(s) || tour) return s;
      return { ...s, filter: e.state };
    case "date":
      if (!onHome(s) || tour) return s;
      return { ...s, view: { ...s.view, at: e.at } };
    case "tour-next":
      if (s.tourStep === null) return s;
      if (s.tourStep === 2) return { ...s, owner: "none", tourStep: null };
      return { ...s, tourStep: s.tourStep === 0 ? 1 : 2 };
    case "source":
      return loadSource(s, e.source);
    case "restore":
      return restore(s, e.view);
  }
}

/** Pure. The screen state of a page load at `view`. */
export function initialScreen(view: View): ScreenState {
  const base: ScreenState = {
    view: { source: DEMO, page: "home", list: false, grave: null, at: null },
    owner: "none",
    popover: "none",
    filter: null,
    homeSource: DEMO,
    homeList: false,
    tourStep: null,
  };
  return reduce(base, { kind: "restore", view });
}
