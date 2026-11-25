// The sound engine (spec cemetery-undead-2, requirement 8). It makes no AudioContext until the first call that needs
// one, passes every Voice through one Master gain capped at MASTER_CAP and a limiter, and goes quiet for good if the
// context cannot be made or resumed.
import { MASTER_CAP, noiseSamples, startVoice, VOICES, type AudioContextLike, type VoiceHandle, type VoiceId } from "./voices.js";

export interface SoundEngine {
  /** Plays a short Voice. Skipped in Serious mode unless the Voice is the bell. */
  play(voice: VoiceId, options: { readonly serious: boolean }): void;
  /** Starts or stops the wind bed. It never plays in Serious mode. */
  wind(on: boolean, options: { readonly serious: boolean }): void;
  /** Ramps the Master gain to 0 within 50 ms, then suspends the context. */
  suspend(): void;
  /** Resumes the context and the Master gain. */
  resume(): void;
  dispose(): void;
  /** True once the context failed: every call is then a no-op. */
  readonly dead: boolean;
}

const FADE_S = 0.05;

/** Pure. A Master gain value: never above MASTER_CAP, never below 0. */
export function capped(value: number): number {
  return Number.isFinite(value) ? Math.min(MASTER_CAP, Math.max(0, value)) : 0;
}

export function createSoundEngine(make: () => AudioContextLike, warn: (message: string) => void = () => {}): SoundEngine {
  let ctx: AudioContextLike | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let dead = false;
  let windHandle: VoiceHandle | null = null;
  /** The pending suspend after a fade; a resume or dispose cancels it (review, task 5). */
  let pendingSuspend: ReturnType<typeof setTimeout> | null = null;
  const cancelSuspend = (): void => {
    if (pendingSuspend !== null) clearTimeout(pendingSuspend);
    pendingSuspend = null;
  };

  const die = (why: string): void => {
    dead = true;
    windHandle = null;
    warn(why);
  };

  const ensure = (): AudioContextLike | null => {
    if (dead) return null;
    if (ctx !== null) return ctx;
    try {
      const c = make();
      const gain = c.createGain();
      gain.gain.value = capped(MASTER_CAP);
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      gain.connect(limiter);
      limiter.connect(c.destination);
      const samples = noiseSamples(c.sampleRate);
      const buffer = c.createBuffer(1, samples.length, c.sampleRate);
      buffer.copyToChannel(samples, 0);
      ctx = c;
      master = gain;
      noise = buffer;
      return c;
    } catch {
      die("sound: the audio context could not be made");
      return null;
    }
  };

  const wake = (c: AudioContextLike): void => {
    if (c.state !== "suspended") return;
    c.resume().catch(() => {
      die("sound: the audio context could not be resumed");
    });
  };

  return {
    get dead() {
      return dead;
    },
    play(voice, { serious }) {
      if (voice === "wind" || (serious && !VOICES[voice].serious)) return;
      const c = ensure();
      if (c === null || master === null || noise === null) return;
      wake(c);
      try {
        startVoice(c, master, noise, voice);
      } catch {
        die("sound: a voice could not start");
      }
    },
    wind(on, { serious }) {
      if (!on || serious) {
        windHandle?.stop();
        windHandle = null;
        return;
      }
      if (windHandle !== null) return;
      const c = ensure();
      if (c === null || master === null || noise === null) return;
      wake(c);
      try {
        windHandle = startVoice(c, master, noise, "wind");
      } catch {
        die("sound: the wind could not start");
      }
    },
    suspend() {
      if (ctx === null || master === null || dead) return;
      const c = ctx;
      const now = c.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(capped(master.gain.value), now);
      master.gain.linearRampToValueAtTime(0, now + FADE_S);
      windHandle?.stop();
      windHandle = null;
      cancelSuspend();
      pendingSuspend = setTimeout(() => {
        pendingSuspend = null;
        if (c.state === "running") c.suspend().catch(() => {});
      }, FADE_S * 1000 + 10);
    },
    resume() {
      cancelSuspend();
      const c = ensure();
      if (c === null || master === null) return;
      const now = c.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(capped(MASTER_CAP), now);
      wake(c);
    },
    dispose() {
      cancelSuspend();
      windHandle?.stop();
      windHandle = null;
      if (ctx !== null) ctx.close().catch(() => {});
      ctx = null;
      master = null;
    },
  };
}
