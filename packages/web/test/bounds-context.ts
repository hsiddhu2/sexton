// A PaintContext2D that draws nothing and records the bounds of every mark, for the Art box properties
// (spec cemetery-undead-2, Property 2). It follows setTransform, translate, scale, rotate, save, restore and clip
// (as a bounding box), reads every point of the SVG path strings the painter uses (M, L, H, V, Q, C, A, Z, absolute
// only), and grows a stroke's bounds by half its line width times MITER_FACTOR.
import type { GradientLike, PaintContext2D } from "../src/scene/draw.js";

/** A stroke corner may reach past its path by half the line width times this. Covers every corner of 60 degrees or wider. */
export const MITER_FACTOR = 2;
const ARC_SAMPLES = 48;

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** The scale a length takes under m, at its largest (for stroke growth). */
function maxScale(m: Matrix): number {
  return Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
}

function arcPoints(cx: number, cy: number, rx: number, ry: number, phi: number, start: number, delta: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= ARC_SAMPLES; i += 1) {
    const t = start + (delta * i) / ARC_SAMPLES;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    out.push([cx + x * Math.cos(phi) - y * Math.sin(phi), cy + x * Math.sin(phi) + y * Math.cos(phi)]);
  }
  return out;
}

/** SVG elliptical arc, endpoint form to centre form (SVG 1.1 appendix F.6.5), sampled. */
function svgArc(x1: number, y1: number, rxIn: number, ryIn: number, deg: number, large: boolean, sweep: boolean, x2: number, y2: number): [number, number][] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (deg * Math.PI) / 180;
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = Math.cos(phi) * dx + Math.sin(phi) * dy;
  const y1p = -Math.sin(phi) * dx + Math.cos(phi) * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (x1 + x2) / 2;
  const cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  return arcPoints(cx, cy, rx, ry, phi, start, delta);
}

/** Every point an absolute SVG path string can touch. Curve control points bound their curve. */
export function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[MLHVQCAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const out: [number, number][] = [];
  let i = 0;
  let cmd = "M";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const num = (): number => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/^[A-Za-z]$/.test(t)) {
      if (t !== t.toUpperCase()) throw new Error(`relative path command ${t} is not read by the probe`);
      cmd = t;
      i += 1;
      if (cmd === "Z") {
        x = startX;
        y = startY;
        continue;
      }
    }
    switch (cmd) {
      case "M":
        x = num();
        y = num();
        startX = x;
        startY = y;
        out.push([x, y]);
        cmd = "L";
        break;
      case "L":
        x = num();
        y = num();
        out.push([x, y]);
        break;
      case "H":
        x = num();
        out.push([x, y]);
        break;
      case "V":
        y = num();
        out.push([x, y]);
        break;
      case "Q": {
        const qx = num();
        const qy = num();
        x = num();
        y = num();
        out.push([qx, qy], [x, y]);
        break;
      }
      case "C": {
        const ax = num();
        const ay = num();
        const bx = num();
        const by = num();
        x = num();
        y = num();
        out.push([ax, ay], [bx, by], [x, y]);
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const nx = num();
        const ny = num();
        out.push(...svgArc(x, y, rx, ry, rot, large, sweep, nx, ny));
        x = nx;
        y = ny;
        break;
      }
      default:
        throw new Error(`path command ${cmd} is not read by the probe`);
    }
  }
  return out;
}

interface Frame {
  m: Matrix;
  clip: Box | null;
}

/** A recording context. `marks` holds one Box per drawing call, in the coordinates of the identity transform. */
export class BoundsContext implements PaintContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  readonly marks: { readonly kind: string; readonly style: string; readonly box: Box; readonly poly: readonly (readonly [number, number])[]; readonly grow: number }[] = [];
  private frame: Frame = { m: IDENTITY, clip: null };
  private readonly stack: Frame[] = [];
  private path: [number, number][] = [];

  private record(kind: string, points: readonly [number, number][], grow: number): void {
    if (points.length === 0) return;
    const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const [px, py] of points) {
      box.minX = Math.min(box.minX, px - grow);
      box.maxX = Math.max(box.maxX, px + grow);
      box.minY = Math.min(box.minY, py - grow);
      box.maxY = Math.max(box.maxY, py + grow);
    }
    const c = this.frame.clip;
    if (c !== null) {
      box.minX = Math.max(box.minX, c.minX);
      box.minY = Math.max(box.minY, c.minY);
      box.maxX = Math.min(box.maxX, c.maxX);
      box.maxY = Math.min(box.maxY, c.maxY);
      if (box.minX >= box.maxX || box.minY >= box.maxY) return;
    }
    const style = kind.startsWith("stroke") ? String(this.strokeStyle) : String(this.fillStyle);
    this.marks.push({ kind, style, box, poly: points, grow });
  }

  private toScene(points: readonly [number, number][]): [number, number][] {
    return points.map(([px, py]) => apply(this.frame.m, px, py));
  }

  private rectPoints(x: number, y: number, w: number, h: number): [number, number][] {
    return this.toScene([
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.frame.m = [a, b, c, d, e, f];
  }
  clearRect(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    this.record("fillRect", this.rectPoints(x, y, w, h), 0);
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.record("strokeRect", this.rectPoints(x, y, w, h), (this.lineWidth / 2) * MITER_FACTOR * maxScale(this.frame.m));
  }
  save(): void {
    this.stack.push({ m: this.frame.m, clip: this.frame.clip });
  }
  restore(): void {
    const top = this.stack.pop();
    if (top !== undefined) this.frame = { m: top.m, clip: top.clip };
  }
  translate(x: number, y: number): void {
    this.frame.m = multiply(this.frame.m, [1, 0, 0, 1, x, y]);
  }
  rotate(angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.frame.m = multiply(this.frame.m, [c, s, -s, c, 0, 0]);
  }
  scale(x: number, y: number): void {
    this.frame.m = multiply(this.frame.m, [x, 0, 0, y, 0, 0]);
  }
  beginPath(): void {
    this.path = [];
  }
  arc(x: number, y: number, r: number, start: number, end: number): void {
    this.path.push(...this.toScene(arcPoints(x, y, r, r, 0, start, end - start)));
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.path.push(...this.rectPoints(x, y, w, h));
  }
  clip(): void {
    const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const [px, py] of this.path) {
      box.minX = Math.min(box.minX, px);
      box.maxX = Math.max(box.maxX, px);
      box.minY = Math.min(box.minY, py);
      box.maxY = Math.max(box.maxY, py);
    }
    const c = this.frame.clip;
    this.frame.clip =
      c === null ? box : { minX: Math.max(c.minX, box.minX), minY: Math.max(c.minY, box.minY), maxX: Math.min(c.maxX, box.maxX), maxY: Math.min(c.maxY, box.maxY) };
  }
  fill(path?: Path2D): void {
    if (path === undefined) this.record("fill", this.path, 0);
    else this.record("fill", this.toScene(pathPoints((path as unknown as { d: string }).d)), 0);
  }
  stroke(path: Path2D): void {
    this.record("stroke", this.toScene(pathPoints((path as unknown as { d: string }).d)), (this.lineWidth / 2) * MITER_FACTOR * maxScale(this.frame.m));
  }
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? "10");
    const w = Math.min(maxWidth ?? text.length * size, text.length * size);
    const left = this.textAlign === "center" ? x - w / 2 : this.textAlign === "right" || this.textAlign === "end" ? x - w : x;
    this.record("fillText", this.rectPoints(left, y - size, w, size * 1.3), 0);
  }
  createLinearGradient(): GradientLike {
    return { addColorStop() {} };
  }
  createRadialGradient(): GradientLike {
    return { addColorStop() {} };
  }
}

/** The union of every recorded mark, or null. */
export function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const out: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const b of boxes) {
    out.minX = Math.min(out.minX, b.minX);
    out.minY = Math.min(out.minY, b.minY);
    out.maxX = Math.max(out.maxX, b.maxX);
    out.maxY = Math.max(out.maxY, b.maxY);
  }
  return out;
}
