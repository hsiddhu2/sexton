// The five Voices of the approved Sound list (spec cemetery-undead-2, design.md B1). Pure data plus the node graphs
// that make them. No audio file: oscillators, and noise from a fixed seed, never a random source.
import { mulberry32 } from "../scene/scenery-seed.js";

export type VoiceId = "wind" | "sting" | "thud" | "bell" | "ghost";

/** The Master gain never goes above this. */
export const MASTER_CAP = 0.7;
/** Every Voice but the wind bed ends within this. */
export const MAX_VOICE_MS = 2_500;
/** The seed of the noise buffer (the scenery seed). */
export const NOISE_SEED = 0x5e7701c3;
export const NOISE_SECONDS = 2;

export interface VoiceSpec {
  /** The Voice gain at its peak, before the Master gain. */
  readonly peak: number;
  /** Its length, or null for the looping wind bed. */
  readonly durationMs: number | null;
  /** True when it may play in Serious mode: the burial bell only. */
  readonly serious: boolean;
}

export const VOICES: Readonly<Record<VoiceId, VoiceSpec>> = {
  wind: { peak: 0.05, durationMs: null, serious: false },
  sting: { peak: 0.16, durationMs: 1_100, serious: false },
  thud: { peak: 0.28, durationMs: 400, serious: false },
  bell: { peak: 0.2, durationMs: 2_400, serious: true },
  ghost: { peak: 0.12, durationMs: 800, serious: false },
};

/** The bell's partials of 330 Hz: [ratio, level] (hum, strike, minor third, fifth, octave). */
export const BELL_PARTIALS: readonly (readonly [number, number])[] = [
  [0.5, 0.6],
  [1, 1],
  [1.19, 0.5],
  [1.5, 0.35],
  [2, 0.25],
];

/** Pure. NOISE_SECONDS of white noise in [-1, 1) at a sample rate, from NOISE_SEED. */
export function noiseSamples(sampleRate: number): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * NOISE_SECONDS));
  const out = new Float32Array(n);
  const next = mulberry32(NOISE_SEED);
  for (let i = 0; i < n; i += 1) out[i] = next() * 2 - 1;
  return out;
}

/** The subset of AudioContext the Voices and the engine call. Tests pass a fake. */
export type AudioContextLike = Pick<
  AudioContext,
  | "createGain"
  | "createOscillator"
  | "createBiquadFilter"
  | "createBufferSource"
  | "createBuffer"
  | "createDynamicsCompressor"
  | "destination"
  | "currentTime"
  | "sampleRate"
  | "state"
  | "resume"
  | "suspend"
  | "close"
>;

/** A playing Voice: stop() ends it early within a short fade. */
export interface VoiceHandle {
  stop(): void;
}

const SILENT = 0.0001;

function envelope(gain: GainNode, t: number, peak: number, attack: number, end: number): void {
  gain.gain.setValueAtTime(SILENT, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(SILENT, t + end);
}

/** Builds one Voice into `out` at the context's current time. The wind bed loops until stopped. */
export function startVoice(ctx: AudioContextLike, out: AudioNode, noise: AudioBuffer, id: VoiceId): VoiceHandle {
  const t = ctx.currentTime;
  const spec = VOICES[id];
  const gain = ctx.createGain();
  gain.connect(out);
  const sources: AudioScheduledSourceNode[] = [];
  /** Sources started with their own stop, stopped early by stop() only. */
  const extra: AudioScheduledSourceNode[] = [];
  const end = (spec.durationMs ?? 0) / 1000;
  if (id === "wind") {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 380;
    band.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 120;
    lfo.connect(depth);
    depth.connect(band.frequency);
    src.connect(band);
    band.connect(gain);
    gain.gain.setValueAtTime(SILENT, t);
    gain.gain.linearRampToValueAtTime(spec.peak, t + 1.5);
    sources.push(src, lfo);
  } else if (id === "sting") {
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1_400;
    low.connect(gain);
    for (const f of [146.83, 155.56]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.connect(low);
      sources.push(osc);
    }
    envelope(gain, t, spec.peak, 0.008, end);
  } else if (id === "thud") {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    osc.connect(gain);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 260;
    src.connect(low);
    low.connect(gain);
    envelope(gain, t, spec.peak, 0.004, end);
    // The noise burst is shorter than the thud: started here with its own stop, and not in `sources`, except to be
    // stopped early by stop().
    src.start(t);
    src.stop(t + 0.12);
    sources.push(osc);
    extra.push(src);
  } else if (id === "bell") {
    const total = BELL_PARTIALS.reduce((sum, [, level]) => sum + level, 0);
    for (const [ratio, level] of BELL_PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 330 * ratio;
      const g = ctx.createGain();
      g.gain.value = level / total;
      osc.connect(g);
      g.connect(gain);
      sources.push(osc);
    }
    envelope(gain, t, spec.peak, 0.003, end);
  } else {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.linearRampToValueAtTime(262, t + end);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 6;
    vib.connect(vibDepth);
    vibDepth.connect(osc.frequency);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 320;
    band.Q.value = 2;
    osc.connect(band);
    band.connect(gain);
    gain.gain.setValueAtTime(SILENT, t);
    gain.gain.linearRampToValueAtTime(spec.peak, t + 0.12);
    gain.gain.setValueAtTime(spec.peak, t + end - 0.3);
    gain.gain.linearRampToValueAtTime(SILENT, t + end);
    sources.push(osc, vib);
  }
  for (const s of sources) {
    s.start(t);
    if (spec.durationMs !== null) s.stop(t + end);
  }
  let stopped = false;
  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.03);
      for (const s of [...sources, ...extra]) {
        try {
          s.stop(now + 0.3);
        } catch {
          // Already stopped.
        }
      }
    },
  };
}
