import type { PackageHealth, State } from "@sexton/api";
import type { Rect } from "../scene/layout.js";
import type { FormView } from "../time/form-at.js";
import { NOT_PUBLISHED_TEXT } from "./grave-label.js";

export const GRACE_MS = 150;
/** Spec cemetery-undead, 7.1: wide enough for the Epitaph line. */
export const TOOLTIP_WIDTH = 240;

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

/**
 * Anchored at its Cell (spec cemetery-undead, 7.1). With the scene width given, it sits beside the cell, as in the
 * mockups (K2d fix 1): right of the cell when it fits, else left of it, else over the cell at offset (8, 4), kept
 * inside the Scene. Without the scene width it is over the cell at offset (8, 4). The top is always cell.y + 4.
 */
export function tooltipRect(cell: Rect, sceneWidth?: number): { readonly left: number; readonly top: number; readonly width: number } {
  const top = cell.y + 4;
  const over = cell.x + 8;
  if (sceneWidth === undefined) return { left: over, top, width: TOOLTIP_WIDTH };
  const right = cell.x + cell.w + 8;
  if (right >= 0 && right + TOOLTIP_WIDTH <= sceneWidth) return { left: right, top, width: TOOLTIP_WIDTH };
  const left = cell.x - TOOLTIP_WIDTH - 8;
  if (left >= 0 && left + TOOLTIP_WIDTH <= sceneWidth) return { left, top, width: TOOLTIP_WIDTH };
  return { left: Math.min(over, Math.max(0, sceneWidth - TOOLTIP_WIDTH - 8)), top, width: TOOLTIP_WIDTH };
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

/** The tooltip's height before it is measured: about its height with five lines. */
export const TOOLTIP_EST_H = 172;

/**
 * The place of a tooltip (spec cemetery-undead-fixes, bug 3): right of its cell, left of it, above it (centred, its
 * bottom 8 px above the cell) or over it, the first that lies inside the Scene and covers no other grave's name label.
 * When none does, or the Scene is not known, the place `tooltipRect` gives.
 */
export function tooltipPlace(
  cell: Rect,
  scene: { readonly width: number; readonly height: number } | undefined,
  height: number,
  labels: readonly Rect[],
): { readonly left: number; readonly top: number; readonly width: number } {
  if (scene === undefined) return tooltipRect(cell);
  const w = TOOLTIP_WIDTH;
  const places: readonly (readonly [number, number])[] = [
    [cell.x + cell.w + 8, cell.y + 4],
    [cell.x - w - 8, cell.y + 4],
    [cell.x + cell.w / 2 - w / 2, cell.y - height - 8],
    [Math.min(cell.x + 8, Math.max(0, scene.width - w - 8)), cell.y + 4],
  ];
  for (const [left, top] of places) {
    if (left < 0 || top < 0 || left + w > scene.width || top + height > scene.height) continue;
    const r = { x: left, y: top, w, h: height };
    if (labels.some((l) => r.x < l.x + l.w && l.x < r.x + r.w && r.y < l.y + l.h && l.y < r.y + r.h)) continue;
    return { left, top, width: w };
  }
  return tooltipRect(cell, scene.width);
}
