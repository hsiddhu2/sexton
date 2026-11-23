export const SCENERY_SEED = 0x5e7701c3;

/** Pure. The same seed always gives the same sequence of numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface UnitStar {
  readonly u: number;
  readonly v: number;
}

export interface UnitTuft {
  readonly u: number;
  readonly v: number;
  readonly h: number;
  readonly tone: "dark" | "light";
}

function wholeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** The first `count` stars of one fixed stream. Star i uses randoms 2i and 2i+1. */
export function unitStars(count: number): readonly UnitStar[] {
  const next = mulberry32(SCENERY_SEED ^ 0x1);
  const out: UnitStar[] = [];
  for (let i = 0; i < wholeCount(count); i += 1) {
    const u = next();
    const v = next();
    out.push({ u, v });
  }
  return out;
}

/** The first `count` tufts of one fixed stream. Tuft i uses randoms 4i to 4i+3: u, v, height, tone. */
export function unitTufts(count: number): readonly UnitTuft[] {
  const next = mulberry32(SCENERY_SEED ^ 0x2);
  const out: UnitTuft[] = [];
  for (let i = 0; i < wholeCount(count); i += 1) {
    const u = next();
    const v = next();
    const h = 4 + Math.floor(next() * 7);
    const tone = next() < 0.5 ? "dark" : "light";
    out.push({ u, v, h, tone });
  }
  return out;
}
