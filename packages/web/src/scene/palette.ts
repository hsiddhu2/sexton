import type { State } from "@sexton/api";

export type Theme = "light" | "dark";

export interface PaletteTheme {
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly focus: string;
  readonly ring: string;
  readonly ghost: string;
  readonly states: Readonly<Record<State, string>>;
}

export const PALETTE: Record<Theme, PaletteTheme> = {
  light: {
    bg: "#f5f1e8",
    surface: "#ffffff",
    text: "#1b1d22",
    muted: "#4a4f5a",
    border: "#6b7280",
    focus: "#1d4ed8",
    ring: "#1d4ed8",
    ghost: "#5b6475",
    states: {
      Alive: "#12561f",
      Restless: "#a8800f",
      Haunted: "#b3361f",
      Dead: "#6b6f7a",
      Possessed: "#7b2cbf",
    },
  },
  dark: {
    bg: "#14161c",
    surface: "#1d2029",
    text: "#ecebe6",
    muted: "#b4b8c2",
    border: "#8a90a0",
    focus: "#7aa2ff",
    ring: "#7aa2ff",
    ghost: "#c7d0e6",
    states: {
      Alive: "#3a9a4e",
      Restless: "#f2d060",
      Haunted: "#ee6a4f",
      Dead: "#9aa0ad",
      Possessed: "#c58cf5",
    },
  },
};

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
  };
}

export function applyPalette(root: HTMLElement, theme: Theme): void {
  for (const [name, value] of Object.entries(cssVariables(theme))) root.style.setProperty(name, value);
}
