import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STATES } from "../src/load/lists.js";
import { hasGhost, planScene } from "../src/scene/layout.js";
import { colourFor, cssVariables, PALETTE } from "../src/scene/palette.js";
import { SHAPES, SHAPE_BY_STATE } from "../src/scene/shapes.js";
import { arbAdvisoryMode, arbPackage, arbState, arbTheme, scenePackage } from "./arbitraries.js";

const NUM_RUNS = 100;
const one = (pkg: Parameters<typeof planScene>[0]["packages"][number], width: number, theme: "light" | "dark") => {
  const grave = planScene({ packages: [pkg], width, theme, selectedIndex: null, ghostPhase: 0 }).graves[0];
  if (grave === undefined) throw new Error("no grave");
  return grave;
};

describe("Feature: cemetery-ui, Property 2: Grave shape and colour are functions of state only", () => {
  it("equal states give equal shape and fill whatever else differs", () => {
    fc.assert(
      fc.property(arbPackage, arbPackage, arbTheme, fc.integer({ min: 100, max: 2000 }), (p1, p2, theme, width) => {
        const twin = { ...p2, state: p1.state };
        const a = one(p1, width, theme);
        const b = one(twin, width + 97, theme);
        expect([a.shape, a.fill]).toEqual([b.shape, b.fill]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("different states differ in the (shape, fill) pair, Alive and Restless sharing upright", () => {
    fc.assert(
      fc.property(arbState, arbState, arbTheme, (s1, s2, theme) => {
        fc.pre(s1 !== s2);
        const a = one(scenePackage("a", s1, "none"), 300, theme);
        const b = one(scenePackage("a", s2, "none"), 300, theme);
        expect(`${a.shape}|${a.fill}`).not.toBe(`${b.shape}|${b.fill}`);
        if (a.shape === b.shape) {
          expect([s1, s2].sort()).toEqual(["Alive", "Restless"]);
          expect(a.shape).toBe("upright");
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Feature: cemetery-ui, Property 3: A ghost is present if and only if the advisories signal is available and non-empty", () => {
  it("hasGhost and planned ghosts match the direct predicate", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(arbState, arbAdvisoryMode), { maxLength: 40 }), arbTheme, (rows, theme) => {
        const packages = rows.map(([state, mode], i) => scenePackage(`p${i}`, state, mode));
        const direct = packages.map((p) => p.signals.advisories.available && p.signals.advisories.value.length > 0);
        expect(packages.map(hasGhost)).toEqual(direct);
        const plan = planScene({ packages, width: 600, theme, selectedIndex: null, ghostPhase: 0 });
        expect(plan.graves.map((g) => g.ghost !== null)).toEqual(direct);
        expect(plan.graves.filter((g) => g.ghost !== null)).toHaveLength(direct.filter(Boolean).length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("an available empty list and an unavailable signal give no ghost", () => {
    expect(hasGhost(scenePackage("a", "Haunted", "none"))).toBe(false);
    expect(hasGhost(scenePackage("a", "Haunted", "unavailable"))).toBe(false);
    expect(hasGhost(scenePackage("a", "Alive", "some"))).toBe(true);
  });
});

describe("shapes and palette examples", () => {
  it("has four distinct shape path strings and the specified state mapping", () => {
    const paths = Object.values(SHAPES).map((s) => s.d);
    expect(new Set(paths).size).toBe(4);
    expect(SHAPE_BY_STATE).toEqual({ Alive: "upright", Restless: "upright", Haunted: "cross", Dead: "cracked", Possessed: "open" });
    expect(SHAPES.cracked.tiltDegrees).not.toBe(0);
    for (const id of ["upright", "cross", "open"] as const) expect(SHAPES[id].tiltDegrees).toBe(0);
  });

  it("has five pairwise distinct state colours per theme", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(new Set(STATES.map((s) => colourFor(s, theme))).size).toBe(5);
    }
  });

  it("styles.css holds no colour literal and uses only known variables", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor\(/);
    const known = new Set(Object.keys(cssVariables("light")));
    expect(Object.keys(cssVariables("dark"))).toEqual(Object.keys(cssVariables("light")));
    for (const match of css.matchAll(/var\((--[a-z-]+)/g)) expect(known.has(match[1] ?? "")).toBe(true);
    expect(PALETTE.light.bg).not.toBe(PALETTE.dark.bg);
  });
});

// Task 10.2: WCAG 2.1 contrast computed from the palette and from the custom properties styles.css uses.
function channel(hex: string, offset: number): number {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = ["light", "dark"] as const;
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

describe("palette contrast (WCAG 2.1 relative luminance)", () => {
  it("every palette colour is a six digit hex", () => {
    for (const theme of THEMES) {
      for (const value of Object.values(cssVariables(theme))) expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("text and muted text are at least 4.5 to 1 against bg and surface", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      for (const fg of [p.text, p.muted]) {
        for (const back of [p.bg, p.surface]) expect(contrast(fg, back)).toBeGreaterThanOrEqual(TEXT_MIN);
      }
    }
  });

  it("state colours, ghost, selection ring, focus and border are at least 3 to 1 against bg", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      const colours: Record<string, string> = { ghost: p.ghost, ring: p.ring, focus: p.focus, border: p.border };
      for (const state of STATES) colours[state] = colourFor(state, theme);
      for (const [name, colour] of Object.entries(colours)) {
        expect(contrast(colour, p.bg), `${theme} ${name} on bg`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      }
    }
  });

  it("focus and border are at least 3 to 1 against surface, where the drawer and controls use them", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      for (const colour of [p.focus, p.border]) expect(contrast(colour, p.surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
  });

  it("Alive against Restless is at least 1.5 to 1", () => {
    for (const theme of THEMES) {
      expect(contrast(colourFor("Alive", theme), colourFor("Restless", theme))).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("every pair that styles.css builds from custom properties meets its minimum, in both themes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const vars = (theme: "light" | "dark"): Record<string, string> => cssVariables(theme);
    const backgrounds = ["--bg", "--surface"];
    let checked = 0;
    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = block[2] ?? "";
      const fg = /(?:^|[;\s])color:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      const bgVar = /background:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      const edges = [...body.matchAll(/(?:border[a-z-]*|outline):[^;]*var\((--[a-z-]+)\)/g)].map((m) => m[1] ?? "");
      for (const theme of THEMES) {
        const v = vars(theme);
        const value = (name: string): string => {
          const found = v[name];
          if (found === undefined) throw new Error(`unknown variable ${name}`);
          return found;
        };
        if (fg !== undefined) {
          for (const back of bgVar === undefined ? backgrounds : [bgVar]) {
            expect(contrast(value(fg), value(back)), `${theme} ${fg} on ${back}`).toBeGreaterThanOrEqual(TEXT_MIN);
            checked += 1;
          }
        }
        for (const edge of edges) {
          for (const back of bgVar === undefined ? backgrounds : [bgVar]) {
            expect(contrast(value(edge), value(back)), `${theme} ${edge} on ${back}`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
