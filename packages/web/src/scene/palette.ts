import type { State } from "@sexton/api";

export type Theme = "light" | "dark";

export type CostumeToken = "horns" | "eyes" | "cape" | "skin" | "bone" | "onesie" | "hat" | "flower" | "blush" | "dirt";

export interface PaletteTheme {
  readonly skyTop: string;
  readonly skyMid: string;
  readonly skyHorizon: string;
  readonly groundTop: string;
  readonly bg: string;
  readonly horizon: string;
  readonly moon: string;
  readonly fog: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly focus: string;
  readonly ring: string;
  readonly ghost: string;
  readonly ink: string;
  readonly pit: string;
  readonly star: string;
  readonly starFar: string;
  readonly grassDark: string;
  readonly grassLight: string;
  readonly field: string;
  readonly accentBg: string;
  readonly accentText: string;
  readonly wordmark: string;
  readonly marker: string;
  /** Church, fence, tree and bats. */
  readonly silhouette: string;
  /** The Lantern glow under the hovered or focused grave. */
  readonly lantern: string;
  /** The rim of the harvest moon; the centre is moon. */
  readonly moonEdge: string;
  /** The hover ring on a grave that is not the Selected one (spec clean-site, 3.13). It sits on the Ring casing. */
  readonly ringHover: string;
  /**
   * Spec clean-site, design C14: the chrome around the Scene, from the approved prototype. The `ui` prefix keeps the
   * canvas tokens bg, text and muted as they are. uiFaint and uiAccent differ from the prototype (decisions in design.md).
   */
  readonly uiBg: string;
  readonly uiBg2: string;
  readonly uiPanel: string;
  readonly uiPanel2: string;
  readonly uiLine: string;
  readonly uiLine2: string;
  readonly uiText: string;
  readonly uiMuted: string;
  readonly uiFaint: string;
  readonly uiAccent: string;
  readonly uiAccentInk: string;
  /** Drawn Costume layers (spec cemetery-undead, design.md "Palette"). */
  readonly costume: Readonly<Record<CostumeToken, string>>;
  readonly states: Readonly<Record<State, string>>;
}

const NIGHT: PaletteTheme = {
  skyTop: "#0e0b1a",
  skyMid: "#241339",
  skyHorizon: "#5a2d6e",
  groundTop: "#2e2440",
  bg: "#120d1c",
  horizon: "#7a3f8c",
  moon: "#f2a030",
  fog: "#6f5296",
  surface: "#1a1328",
  text: "#f1ece2",
  muted: "#cdc4db",
  border: "#ab9cc6",
  focus: "#e8a30c",
  ring: "#e8a30c",
  ghost: "#f4f0fa",
  ink: "#140f22",
  pit: "#05030a",
  star: "#f4f1de",
  starFar: "#c2b5df",
  grassDark: "#2c2140",
  grassLight: "#3a2a52",
  field: "#150f22",
  accentBg: "#e8a30c",
  accentText: "#140f22",
  wordmark: "#f2b02e",
  marker: "#f6e7c1",
  silhouette: "#08060f",
  lantern: "#ffb547",
  moonEdge: "#d9781e",
  ringHover: "#c9c2dc",
  uiBg: "#0f0d1a",
  uiBg2: "#141127",
  uiPanel: "#17142a",
  uiPanel2: "#1d1a33",
  uiLine: "#2a2644",
  uiLine2: "#3a3560",
  uiText: "#eeebf7",
  uiMuted: "#a19cba",
  uiFaint: "#8a85a6",
  uiAccent: "#f2c46b",
  uiAccentInk: "#1a1206",
  costume: {
    horns: "#d23a3a",
    eyes: "#ff3b30",
    cape: "#7a1f3d",
    skin: "#7fae4e",
    bone: "#ece5d6",
    onesie: "#5b4a8a",
    hat: "#f6a93b",
    flower: "#ffd1e8",
    blush: "#f2a7c3",
    dirt: "#3b2a22",
  },
  states: {
    Alive: "#8fe3d0",
    Restless: "#e69f00",
    Haunted: "#56b4e9",
    Dead: "#bfb8ad",
    Possessed: "#cc79a7",
  },
};

/** One table. Both keys point to it: the app is night-only. */
export const PALETTE: Record<Theme, PaletteTheme> = { light: NIGHT, dark: NIGHT };

/** Alpha bytes appended to a token to form transparency without globalAlpha. */
export const FOG_PEAK_ALPHA_BYTE = "34";
export const ALPHA_ZERO_BYTE = "00";
export const MOON_HALO_ALPHA_BYTE = "40";
export const SHADOW_ALPHA_BYTE = "80";
export const STONE_ALPHA_BYTE = "40";
/** Spec cemetery-undead: the Lantern glow, the Possessed glow, the vignette and the grain. */
export const LANTERN_ALPHA_BYTE = "18";
export const GLOW_ALPHA_BYTE = "28";
export const VIGNETTE_ALPHA_BYTE = "b0";
export const GRAIN_ALPHA_BYTE = "14";
/**
 * Spec cemetery-undead-2, A3: the Halo, the strong part of the Possessed glow. Drawn only where no token a contrast
 * check guards can sit (scene/halo.ts), so it is not a Glow stop.
 */
export const HALO_ALPHA_BYTE = "a0";
/**
 * Spec clean-site, 2.7: the one fixed alpha of a grave dimmed by a filter, as a byte; the painter sets
 * globalAlpha to DIM_ALPHA_BYTE / 255 around every per-grave draw of a dimmed grave. Categorical, not a scale.
 */
export const DIM_ALPHA_BYTE = "38";

/** Pure. The globalAlpha of a dimmed grave. */
export function dimAlpha(): number {
  return parseInt(DIM_ALPHA_BYTE, 16) / 255;
}

const FOG_PEAK = 52;

export function colourFor(state: State, theme: Theme): string {
  return PALETTE[theme].states[state];
}

export function cssVariables(theme: Theme): Record<string, string> {
  const p = PALETTE[theme];
  return {
    "--bg": p.bg,
    "--surface": p.surface,
    "--text": p.text,
    "--muted": p.muted,
    "--border": p.border,
    "--focus": p.focus,
    "--ring": p.ring,
    "--ghost": p.ghost,
    "--state-alive": p.states.Alive,
    "--state-restless": p.states.Restless,
    "--state-haunted": p.states.Haunted,
    "--state-dead": p.states.Dead,
    "--state-possessed": p.states.Possessed,
    "--sky-top": p.skyTop,
    "--sky-mid": p.skyMid,
    "--sky-horizon": p.skyHorizon,
    "--ground-top": p.groundTop,
    "--horizon": p.horizon,
    "--moon": p.moon,
    "--fog": p.fog,
    "--ink": p.ink,
    "--star": p.star,
    "--star-far": p.starFar,
    "--grass-dark": p.grassDark,
    "--grass-light": p.grassLight,
    "--field": p.field,
    "--accent-bg": p.accentBg,
    "--accent-text": p.accentText,
    "--wordmark": p.wordmark,
    "--marker": p.marker,
    "--ring-hover": p.ringHover,
    "--ui-bg": p.uiBg,
    "--ui-bg2": p.uiBg2,
    "--ui-panel": p.uiPanel,
    "--ui-panel2": p.uiPanel2,
    "--ui-line": p.uiLine,
    "--ui-line2": p.uiLine2,
    "--ui-text": p.uiText,
    "--ui-muted": p.uiMuted,
    "--ui-faint": p.uiFaint,
    "--ui-accent": p.uiAccent,
    "--ui-accent-ink": p.uiAccentInk,
  };
}

export function applyPalette(root: HTMLElement, theme: Theme): void {
  for (const [name, value] of Object.entries(cssVariables(theme))) root.style.setProperty(name, value);
}

function mix(under: string, over: string, alpha: number): string {
  let out = "#";
  for (const offset of [1, 3, 5]) {
    const u = parseInt(under.slice(offset, offset + 2), 16);
    const o = parseInt(over.slice(offset, offset + 2), 16);
    const c = Math.round(u + ((o - u) * alpha) / 255);
    out += c.toString(16).padStart(2, "0");
  }
  return out;
}

/** The ten Backdrop stops: five tokens, the fog composites over skyHorizon and groundTop at 52/255, the two grass tokens and the shadow (pit at 128/255 over groundTop). */
export function backdropStops(theme: Theme): readonly string[] {
  const p = PALETTE[theme];
  return [
    p.skyTop,
    p.skyMid,
    p.skyHorizon,
    p.groundTop,
    p.bg,
    mix(p.skyHorizon, p.fog, FOG_PEAK),
    mix(p.groundTop, p.fog, FOG_PEAK),
    p.grassDark,
    p.grassLight,
    mix(p.groundTop, p.pit, 128),
  ];
}

/** The tokens a glow can sit on under a grave: groundTop, the fog over the ground, the two grass tokens and bg. */
function underGrave(p: PaletteTheme): readonly string[] {
  return [p.groundTop, mix(p.groundTop, p.fog, FOG_PEAK), p.grassDark, p.grassLight, p.bg];
}

/**
 * The ten Glow stops (spec cemetery-undead, requirement 1.4): the lantern at LANTERN_ALPHA_BYTE and the Possessed
 * colour at GLOW_ALPHA_BYTE, each over the five tokens under a grave. A grave has at most one glow, so none stack.
 */
export function glowStops(theme: Theme): readonly string[] {
  const p = PALETTE[theme];
  const lantern = parseInt(LANTERN_ALPHA_BYTE, 16);
  const glow = parseInt(GLOW_ALPHA_BYTE, 16);
  return [...underGrave(p).map((u) => mix(u, p.lantern, lantern)), ...underGrave(p).map((u) => mix(u, p.states.Possessed, glow))];
}
