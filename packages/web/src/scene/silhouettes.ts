// Backdrop silhouettes: the church, a dead tree and the bats (spec cemetery-undead, 6.1). Fixed paths, the same for
// every scan. Drawn in the silhouette token. Original drawings.

/** A small church: nave, a pointed roof and a steeple with a cross. Origin at its top-left, base on the horizon. */
export const CHURCH_PATH = {
  w: 92,
  h: 150,
  d: "M0 150 V96 L30 70 L60 96 V150 Z M38 150 V58 L50 34 L62 58 V150 Z M48 34 V8 H52 V34 Z M43 16 H57 V20 H43 Z M64 150 V110 H92 V150 Z",
} as const;

/** A bare tree with three branches. */
export const TREE_PATH = {
  w: 80,
  h: 132,
  d: "M36 132 L38 70 L14 44 L18 40 L40 62 L42 30 L46 30 L46 58 L66 34 L70 38 L48 70 L46 132 Z",
} as const;

/** Bat wing poses: wings up, level, down, level. 28 by 12. */
const BAT_PATHS: readonly string[] = [
  "M14 6 L9 0 L6 5 L0 2 L4 8 L10 7 L14 10 L18 7 L24 8 L28 2 L22 5 L19 0 Z",
  "M14 6 L8 4 L4 6 L0 6 L5 9 L10 8 L14 10 L18 8 L23 9 L28 6 L24 6 L20 4 Z",
  "M14 6 L9 8 L6 11 L1 12 L5 9 L10 8 L14 10 L18 8 L23 9 L27 12 L22 11 L19 8 Z",
  "M14 6 L8 4 L4 6 L0 6 L5 9 L10 8 L14 10 L18 8 L23 9 L28 6 L24 6 L20 4 Z",
];

let churchCache: Path2D | null = null;
let treeCache: Path2D | null = null;
const batCache: Path2D[] = [];

export function churchPath(): Path2D {
  churchCache ??= new Path2D(CHURCH_PATH.d);
  return churchCache;
}

export function treePath(): Path2D {
  treeCache ??= new Path2D(TREE_PATH.d);
  return treeCache;
}

export function batWing(pose: number): Path2D {
  const i = ((pose % BAT_PATHS.length) + BAT_PATHS.length) % BAT_PATHS.length;
  let path = batCache[i];
  if (path === undefined) {
    path = new Path2D(BAT_PATHS[i]);
    batCache[i] = path;
  }
  return path;
}
