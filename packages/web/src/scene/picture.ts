// One grave as a still picture, for the Guide page and the Legend (spec clean-site, design C7): the plan of a single
// grave of a State, with a ghost, a pennant or as the Not-published mound, drawn by the same drawGrave call as the
// Scene. Pure.
import type { State } from "@sexton/api";
import { CELL_HEIGHT, CELL_WIDTH, GRAVE_GEOMETRY, planScene, type GravePlan, type Rect, type ScenePlan } from "./layout.js";
import { colourFor, PALETTE, type Theme } from "./palette.js";
import { SHAPE_BY_STATE } from "./shapes.js";

export type PictureKind = State | "ghost" | "pennant" | "pending";

/** How far a grave may draw past either side of its cell, in cell units (the open grave's lid). */
export const PICTURE_SIDE = 60;
/** The picture's box in cell units: the cell with room on both sides. */
export const PICTURE_BOX: Rect = { x: -PICTURE_SIDE, y: 0, w: CELL_WIDTH + 2 * PICTURE_SIDE, h: CELL_HEIGHT };

/** What each picture looks like, in words (spec cemetery-undead, 10.3). */
export const PICTURE_WORDS: Readonly<Record<PictureKind, string>> = {
  Possessed: "open grave, a devil zombie dancing out",
  Dead: "cracked stone, a skeleton lounging",
  Haunted: "cross",
  Restless: "tilted stone, a hand clawing out",
  Alive: "rounded stone with a party hat",
  ghost: "a ghost over a cross",
  pennant: "a pennant beside a rounded stone",
  pending: "an unmarked mound",
};

/** The State a picture's grave shows: the ghost sits on a Haunted grave, the pennant beside an Alive one. */
function stateOf(kind: PictureKind): State {
  if (kind === "ghost") return "Haunted";
  if (kind === "pennant" || kind === "pending") return "Alive";
  return kind;
}

/** Pure. A one-grave plan at the origin, still (reduced motion), with no name label, ring or glow. */
export function picturePlan(kind: PictureKind, theme: Theme): { readonly plan: ScenePlan; readonly grave: GravePlan } {
  const state = stateOf(kind);
  const pending = kind === "pending";
  const rect: Rect = { x: 0, y: 0, w: CELL_WIDTH, h: CELL_HEIGHT };
  const grave: GravePlan = {
    index: 0,
    name: kind,
    state,
    rect,
    shape: pending ? "unmarked" : SHAPE_BY_STATE[state],
    fill: pending ? PALETTE[theme].border : colourFor(state, theme),
    ghost: kind === "ghost" ? { x: GRAVE_GEOMETRY.ghostX, y: GRAVE_GEOMETRY.ghostTop } : null,
    inscription: null,
    pending,
    marker: kind === "pennant",
    burial: null,
    dimmed: false,
  };
  const empty = planScene({ packages: [], width: CELL_WIDTH, theme, selectedIndex: null, ghostPhase: 0, reducedMotion: true });
  return { plan: { ...empty, graves: [grave], paintOrder: [0] }, grave };
}
