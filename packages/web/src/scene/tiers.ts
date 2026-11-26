// Depth Tiers by urgency (spec cemetery-undead, requirement 5, design.md "Tiers"). Three fixed scales, never a
// continuous encoding. A grave's Tier follows its scan-date State, so graves never move while the scrubber does.
import type { State } from "@sexton/api";

export type TierId = "front" | "middle" | "back";

export const TIER_OF: Readonly<Record<State, TierId>> = { Possessed: "front", Dead: "front", Haunted: "middle", Restless: "middle", Alive: "back" };
export const TIER_SCALE: Readonly<Record<TierId, number>> = { front: 1, middle: 0.8, back: 0.64 };
/** Top of the screen first: the back Tier is drawn highest and first, the front lowest and last. */
export const TIER_DRAW_ORDER: readonly TierId[] = ["back", "middle", "front"];
/** Spec clean-site, 15.3: the Narrow layout stacks the front Tier at the top, so the worst graves come first. */
export const TIER_FRONT_FIRST_ORDER: readonly TierId[] = ["front", "middle", "back"];
/** Vertical gap between two non-empty Tiers. */
export const TIER_GAP = 0;
