import type { State } from "@sexton/api";

export type Theme = "light" | "dark";

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
  readonly states: Readonly<Record<State, string>>;
}

const NIGHT: PaletteTheme = {
  skyTop: "#070b17",
  skyMid: "#11183a",
  skyHorizon: "#262550",
  groundTop: "#1f2b24",
  bg: "#0b0f0d",
  horizon: "#3a4470",
  moon: "#ece8d0",
  fog: "#aab6d6",
  surface: "#141a2b",
  text: "#ecebe6",
  muted: "#b4b8c2",
  border: "#8d93a3",
  focus: "#7aa2ff",
  ring: "#7aa2ff",
  ghost: "#c7d0e6",
  ink: "#0b0e16",
  pit: "#04060a",
  states: {
    Alive: "#43a857",
    Restless: "#f2d060",
    Haunted: "#ee6a4f",
    Dead: "#9aa0ad",
    Possessed: "#c58cf5",
  },
};

/** One table. Both keys point to it: the app is night-only. */
export const PALETTE: Record<Theme, PaletteTheme> = { light: NIGHT, dark: NIGHT };

/** Alpha bytes appended to a token to form transparency without globalAlpha. */
export const FOG_PEAK_ALPHA_BYTE = "34";
export const ALPHA_ZERO_BYTE = "00";
export const MOON_HALO_ALPHA_BYTE = "40";

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

/** The seven Backdrop stops: five tokens and the fog composites over skyHorizon and groundTop at 52/255. */
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
  ];
}
