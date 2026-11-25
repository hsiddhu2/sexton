// Spec cemetery-undead, tasks 2.2 and 2.3: contrast over the Glow stops, and the State colours stay apart under
// simulated colour vision deficiency (requirements 1.4, 1.7). Property 6.
import { describe, expect, it } from "vitest";
import { STATES } from "../src/load/lists.js";
import { glowStops, PALETTE } from "../src/scene/palette.js";

type Rgb = readonly [number, number, number];
type Lab = readonly [number, number, number];

function channels(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear RGB.
 * https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
 */
const MATRICES: Readonly<Record<"protanopia" | "deuteranopia" | "tritanopia", readonly Rgb[]>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulate(hex: string, m: readonly Rgb[]): Rgb {
  const c = channels(hex).map(linear);
  return m.map((row) => Math.min(1, Math.max(0, row[0] * (c[0] ?? 0) + row[1] * (c[1] ?? 0) + row[2] * (c[2] ?? 0)))) as unknown as Rgb;
}

/** Linear sRGB to CIELAB, D65. */
function lab([r, g, b]: Rgb): Lab {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** CIEDE2000 (Sharma, Wu and Dalal 2005). */
export function deltaE2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const h = (b: number, a: number): number => (a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const h1p = h(b1, a1p);
  const h2p = h(b2, a2p);
  const dL = l2 - l1;
  const dC = c2p - c1p;
  let dh = h2p - h1p;
  if (c1p * c2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dh / 2));
  const lBar = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBar = h1p + h2p;
  if (c1p * c2p !== 0) hBar = Math.abs(h1p - h2p) <= 180 ? hBar / 2 : hBar < 360 ? (hBar + 360) / 2 : (hBar - 360) / 2;
  const t = 1 - 0.17 * Math.cos(rad(hBar - 30)) + 0.24 * Math.cos(rad(2 * hBar)) + 0.32 * Math.cos(rad(3 * hBar + 6)) - 0.2 * Math.cos(rad(4 * hBar - 63));
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

const MIN_DELTA_E = 8;

describe("Feature: cemetery-undead, Property 6: Contrast and colour vision over the whole palette", () => {
  it("matches the CIEDE2000 reference pairs of Sharma, Wu and Dalal 2005, Table 1", () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE2000([50, -1.3802, -84.2814], [50, 0, -82.7485])).toBeCloseTo(1.0, 4);
    expect(deltaE2000([50, 2.5, 0], [56, -27, -3])).toBeCloseTo(31.903, 3);
  });

  it("keeps every pair of State colours at least 8 apart in CIEDE2000 under protanopia, deuteranopia and tritanopia", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [kind, m] of Object.entries(MATRICES)) {
        const labs = STATES.map((s) => lab(simulate(PALETTE[theme].states[s], m)));
        for (let i = 0; i < labs.length; i += 1) {
          for (let j = i + 1; j < labs.length; j += 1) {
            const d = deltaE2000(labs[i] as Lab, labs[j] as Lab);
            expect(d, `${kind}: ${String(STATES[i])} and ${String(STATES[j])}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
          }
        }
      }
    }
  });

  it("holds every non-text token at 3:1 or more against every Glow stop, and a grave has ten of them", () => {
    for (const theme of ["light", "dark"] as const) {
      const p = PALETTE[theme];
      const stops = glowStops(theme);
      expect(stops).toHaveLength(10);
      for (const fg of [...STATES.map((s) => p.states[s]), p.ghost, p.marker, p.ring, p.focus, p.border]) {
        for (const stop of stops) expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("the tokens added by cemetery-undead", () => {
  it("are lower-case six-digit hex, and the moon rim and silhouette read against the sky", () => {
    for (const theme of ["light", "dark"] as const) {
      const p = PALETTE[theme];
      for (const v of [p.silhouette, p.lantern, p.moonEdge, ...Object.values(p.costume)]) expect(v).toMatch(/^#[0-9a-f]{6}$/);
      // The moon rim is a non-text graphic against the sky behind it.
      for (const back of [p.skyTop, p.skyMid]) expect(contrast(p.moonEdge, back)).toBeGreaterThanOrEqual(3);
      // The church and fence are darker than the horizon glow they stand against.
      expect(contrast(p.silhouette, p.skyHorizon)).toBeGreaterThanOrEqual(1.5);
      expect(luminance(p.silhouette)).toBeLessThan(luminance(p.skyHorizon));
    }
  });
});

describe("cemetery-undead-2, requirement 4: the pit edge stands apart from the selection ring", () => {
  it("strokes the pit edge in costume.flower, at least 20 CIEDE2000 from the ring and the focus colour", () => {
    for (const theme of ["light", "dark"] as const) {
      const p = PALETTE[theme];
      const edge = lab(channels(p.costume.flower).map(linear) as unknown as Rgb);
      for (const gold of [p.ring, p.focus]) {
        expect(deltaE2000(edge, lab(channels(gold).map(linear) as unknown as Rgb)), `${p.costume.flower} against ${gold}`).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

// Spec judge-path, requirement 4.6: the selection ring and the focus outline sit on their Ring casing, so each must
// read against the ink token it sits on.
describe("Ring casing contrast", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: the ring and the focus colours are each at least 3:1 against ink`, () => {
      const p = PALETTE[theme];
      expect(contrast(p.ring, p.ink)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.focus, p.ink)).toBeGreaterThanOrEqual(3);
    });
  }
});
