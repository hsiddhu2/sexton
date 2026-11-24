// The burial phases. Spec: .kiro/specs/cemetery-time, Requirement 15. Pure.

export const BURIAL_MS = 1200;
/** How far the stone sinks, in CSS pixels, at sink = 1. */
export const BURIAL_SINK_PX = 130;

export interface BurialFrame {
  readonly sink: number;
  readonly mound: number;
  readonly marker: boolean;
}

const SINK_END = 0.35;
const MOUND_END = 0.65;

/** Phase in [0, 1] (clamped; an unreadable phase counts as 0). */
export function burialFrame(phase: number): BurialFrame {
  const p = Number.isFinite(phase) ? Math.min(1, Math.max(0, phase)) : 0;
  if (p < SINK_END) return { sink: p / SINK_END, mound: 0, marker: false };
  if (p < MOUND_END) return { sink: 1, mound: (p - SINK_END) / (MOUND_END - SINK_END), marker: false };
  const back = 1 - (p - MOUND_END) / (1 - MOUND_END);
  return { sink: Math.min(1, Math.max(0, back)), mound: Math.min(1, Math.max(0, back)), marker: true };
}
