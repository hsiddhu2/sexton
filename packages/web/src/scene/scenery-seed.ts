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

export interface UnitTuftSeed {
  readonly off: number;
  readonly v: number;
  readonly r: number;
  readonly r2: number;
  readonly r3: number;
}

export interface UnitCluster {
  readonly cu: number;
  readonly tufts: readonly [UnitTuftSeed, UnitTuftSeed, UnitTuftSeed];
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

/**
 * The first `count` tuft clusters of one fixed stream. Cluster i uses the 16 randoms 16i to 16i+15:
 * the centre, then offset, base, height, direction and tone for each of three tufts.
 */
export function unitClusters(count: number): readonly UnitCluster[] {
  const next = mulberry32(SCENERY_SEED ^ 0x2);
  const out: UnitCluster[] = [];
  for (let i = 0; i < wholeCount(count); i += 1) {
    const cu = next();
    const one = (): UnitTuftSeed => ({ off: next(), v: next(), r: next(), r2: next(), r3: next() });
    const a = one();
    const b = one();
    const c = one();
    out.push({ cu, tufts: [a, b, c] });
  }
  return out;
}
