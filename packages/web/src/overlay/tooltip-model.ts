import type { PackageHealth, State } from "@sexton/api";
import type { Rect } from "../scene/layout.js";
import type { FormView } from "../time/form-at.js";
import { NOT_PUBLISHED_TEXT } from "./grave-label.js";

export const GRACE_MS = 150;
export const TOOLTIP_WIDTH = 176;

export interface TooltipContent {
  readonly name: string;
  readonly version: string;
  readonly state: State;
  readonly reason: string;
  readonly advisoryCount: number | null;
  readonly advisoryText: string;
  /** The state as text: the State, or "not yet published on this date". */
  readonly stateText: string;
  /** "as of <date>" when the Form is before the scan date, else null. */
  readonly asOfText: string | null;
}

export function tooltipContent(pkg: PackageHealth, view?: FormView, asOfDate?: string): TooltipContent {
  const signal = pkg.signals.advisories;
  const advisoryCount = signal.available ? signal.value.length : null;
  const advisoryText =
    advisoryCount === null
      ? "advisories unavailable"
      : advisoryCount === 0
        ? "no advisories"
        : advisoryCount === 1
          ? "1 advisory"
          : `${String(advisoryCount)} advisories`;
  if (view === undefined) {
    return {
      name: pkg.name,
      version: pkg.installedVersion,
      state: pkg.state,
      reason: pkg.stateReason,
      advisoryCount,
      advisoryText,
      stateText: pkg.state,
      asOfText: null,
    };
  }
  const pending = view.state === null;
  return {
    name: pkg.name,
    version: view.version ?? pkg.installedVersion,
    state: view.state ?? pkg.state,
    reason: view.reason,
    advisoryCount: null,
    advisoryText: pending ? "no advisories" : view.ghost ? "has advisories" : "no advisories known",
    stateText: view.state ?? NOT_PUBLISHED_TEXT,
    asOfText: asOfDate === undefined ? null : `as of ${asOfDate}`,
  };
}

/** Inside the Cell: left = cell.x + 8, top = cell.y + 4, width 176. */
export function tooltipRect(cell: Rect): { readonly left: number; readonly top: number; readonly width: number } {
  return { left: cell.x + 8, top: cell.y + 4, width: TOOLTIP_WIDTH };
}

export interface TipState {
  readonly index: number | null;
  readonly source: "pointer" | "focus" | null;
  readonly overTip: boolean;
  readonly leaving: boolean;
  /** True after a reset: nothing shows until a pointer move to a new position or a key-driven focus. */
  readonly quiet: boolean;
  /** Last recorded pointer position, or null. */
  readonly pos: { readonly x: number; readonly y: number } | null;
}

export type TipEvent =
  | { readonly type: "pointer-enter"; readonly index: number; readonly x?: number; readonly y?: number }
  | { readonly type: "pointer-move"; readonly index: number; readonly x: number; readonly y: number }
  | { readonly type: "reset" }
  | { readonly type: "pointer-leave"; readonly index: number }
  | { readonly type: "tip-enter" }
  | { readonly type: "tip-leave" }
  | { readonly type: "focus"; readonly index: number; readonly key?: boolean }
  | { readonly type: "blur"; readonly index: number }
  | { readonly type: "escape" }
  | { readonly type: "grace-expired" };

export const TIP_START: TipState = { index: null, source: null, overTip: false, leaving: false, quiet: false, pos: null };

function withPos(state: TipState, x: number | undefined, y: number | undefined): TipState {
  if (x === undefined || y === undefined) return state;
  if (state.pos !== null && state.pos.x === x && state.pos.y === y) return state;
  return { ...state, pos: { x, y } };
}

export function tipReducer(state: TipState, event: TipEvent): TipState {
  switch (event.type) {
    case "reset":
      return { ...TIP_START, quiet: true, pos: state.pos };
    case "pointer-move": {
      const moved = state.pos === null || state.pos.x !== event.x || state.pos.y !== event.y;
      const recorded = withPos(state, event.x, event.y);
      if (!state.quiet || !moved) return recorded;
      return { index: event.index, source: "pointer", overTip: false, leaving: false, quiet: false, pos: { x: event.x, y: event.y } };
    }
    case "pointer-enter": {
      const recorded = withPos(state, event.x, event.y);
      if (state.quiet) return recorded;
      return { index: event.index, source: "pointer", overTip: false, leaving: false, quiet: false, pos: recorded.pos };
    }
    case "focus":
      if (state.quiet && event.key !== true) return state;
      return { index: event.index, source: "focus", overTip: false, leaving: false, quiet: false, pos: state.pos };
    case "pointer-leave":
      if (state.source === "pointer" && state.index === event.index && !state.overTip) return { ...state, leaving: true };
      return state;
    case "tip-enter":
      if (state.index === null) return state;
      return { ...state, overTip: true, leaving: false };
    case "tip-leave":
      if (state.index === null) return state;
      return { ...state, overTip: false, leaving: state.source === "pointer" };
    case "grace-expired":
      if (state.leaving && !state.overTip && state.source === "pointer") return { ...TIP_START, pos: state.pos };
      return state;
    case "blur":
      if (state.source === "focus" && state.index === event.index) return { ...TIP_START, pos: state.pos };
      return state;
    case "escape":
      return state.quiet ? state : TIP_START;
  }
}
