import type { PackageHealth, State } from "@sexton/api";
import type { Rect } from "../scene/layout.js";

export const GRACE_MS = 150;
export const TOOLTIP_WIDTH = 176;

export interface TooltipContent {
  readonly name: string;
  readonly version: string;
  readonly state: State;
  readonly reason: string;
  readonly advisoryCount: number | null;
  readonly advisoryText: string;
}

export function tooltipContent(pkg: PackageHealth): TooltipContent {
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
  return {
    name: pkg.name,
    version: pkg.installedVersion,
    state: pkg.state,
    reason: pkg.stateReason,
    advisoryCount,
    advisoryText,
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
}

export type TipEvent =
  | { readonly type: "pointer-enter"; readonly index: number }
  | { readonly type: "pointer-leave"; readonly index: number }
  | { readonly type: "tip-enter" }
  | { readonly type: "tip-leave" }
  | { readonly type: "focus"; readonly index: number }
  | { readonly type: "blur"; readonly index: number }
  | { readonly type: "escape" }
  | { readonly type: "grace-expired" };

export const TIP_START: TipState = { index: null, source: null, overTip: false, leaving: false };

export function tipReducer(state: TipState, event: TipEvent): TipState {
  switch (event.type) {
    case "pointer-enter":
      return { index: event.index, source: "pointer", overTip: false, leaving: false };
    case "focus":
      return { index: event.index, source: "focus", overTip: false, leaving: false };
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
      if (state.leaving && !state.overTip && state.source === "pointer") return TIP_START;
      return state;
    case "blur":
      if (state.source === "focus" && state.index === event.index) return TIP_START;
      return state;
    case "escape":
      return TIP_START;
  }
}
