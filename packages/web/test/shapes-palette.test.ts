import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STATES } from "../src/load/lists.js";
import { hasGhost, planScene } from "../src/scene/layout.js";
import { backdropStops, colourFor, cssVariables, PALETTE } from "../src/scene/palette.js";
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

  // Spec cemetery-undead, Deliberate test change 2: no shape is shared any more.
  it("different states differ in the (shape, fill) pair", () => {
    fc.assert(
      fc.property(arbState, arbState, arbTheme, (s1, s2, theme) => {
        fc.pre(s1 !== s2);
        const a = one(scenePackage("a", s1, "none"), 300, theme);
        const b = one(scenePackage("a", s2, "none"), 300, theme);
        expect(`${a.shape}|${a.fill}`).not.toBe(`${b.shape}|${b.fill}`);
        expect(a.shape).not.toBe(b.shape);
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
  // Spec cemetery-undead, Deliberate test change 1: rounded for Alive, tilted for Restless, two tilted shapes.
  it("has six distinct shape path strings and the specified state mapping", () => {
    const paths = Object.values(SHAPES).map((s) => s.d);
    expect(new Set(paths).size).toBe(6);
    expect(SHAPE_BY_STATE).toEqual({ Alive: "rounded", Restless: "tilted", Haunted: "cross", Dead: "cracked", Possessed: "open" });
    expect(SHAPES.cracked.tiltDegrees).not.toBe(0);
    expect(SHAPES.tilted.tiltDegrees).not.toBe(0);
    for (const id of ["rounded", "cross", "open", "unmarked"] as const) expect(SHAPES[id].tiltDegrees).toBe(0);
    expect(SHAPES.open.pit).not.toBeNull();
    for (const id of ["rounded", "tilted", "cross", "cracked", "unmarked"] as const) expect(SHAPES[id].pit).toBeNull();
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
    expect(PALETTE.light).toBe(PALETTE.dark);
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

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("Feature: cemetery-theme, Property 1: Palette contrast over every backdrop stop", () => {
  it("holds for every token against every Backdrop stop, in both Theme keys", () => {
    fc.assert(
      fc.property(arbTheme, fc.nat({ max: 9 }), (theme, stopIndex) => {
        const p = PALETTE[theme];
        const stops = backdropStops(theme);
        expect(stops).toHaveLength(10);
        const stop = stops[stopIndex] as string;
        expect(stop).toMatch(/^#[0-9a-f]{6}$/);
        for (const fg of [p.text, p.muted, p.wordmark]) expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(TEXT_MIN);
        const nonText = [p.ghost, p.marker, p.ring, p.focus, p.border, ...STATES.map((s) => colourFor(s, theme))];
        for (const fg of nonText) expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: cemetery-polish, Property 1: Palette contrast over every backdrop stop
  it("Feature: cemetery-polish, Property 1: Palette contrast over every backdrop stop", () => {
    fc.assert(
      fc.property(arbTheme, fc.nat({ max: 9 }), (theme, stopIndex) => {
        const p = PALETTE[theme];
        const stops = backdropStops(theme);
        expect(stops).toHaveLength(10);
        const stop = stops[stopIndex] as string;
        for (const fg of [p.text, p.muted, p.wordmark]) {
          expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(TEXT_MIN);
          for (const back of [p.surface, p.field]) expect(contrast(fg, back)).toBeGreaterThanOrEqual(TEXT_MIN);
        }
        for (const fg of [...STATES.map((s) => colourFor(s, theme)), p.ghost, p.marker, p.ring, p.focus, p.border]) {
          expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
        }
        for (const fg of [p.focus, p.border]) expect(contrast(fg, p.field)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
        expect(contrast(p.accentText, p.accentBg)).toBeGreaterThanOrEqual(TEXT_MIN);
        for (const back of [p.skyTop, p.skyMid]) expect(contrast(p.accentBg, back)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
        for (const star of [p.star, p.starFar]) {
          for (const back of [p.skyTop, p.skyMid, p.skyHorizon]) expect(contrast(star, back)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
        }
        for (const s of STATES) expect(contrast(p.ink, colourFor(s, theme))).toBeGreaterThanOrEqual(TEXT_MIN);
        for (const t of [p.star, p.starFar, p.grassDark, p.grassLight, p.field, p.accentBg, p.accentText, p.wordmark, p.marker]) {
          expect(t).toMatch(/^#[0-9a-f]{6}$/);
        }
        expect(luminance(stops[9] as string)).toBeLessThanOrEqual(luminance(p.groundTop));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("names the darkest and the lightest stop and meets the minimums on both", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      const stops = backdropStops(theme);
      const byLuminance = [...stops].sort((a, b) => luminance(a) - luminance(b));
      const darkest = byLuminance[0] as string;
      const lightest = byLuminance[byLuminance.length - 1] as string;
      expect(darkest).toBe(p.skyTop);
      expect(lightest).toBe(stops[5]);
      for (const stop of [darkest, lightest]) {
        expect(contrast(p.text, stop)).toBeGreaterThanOrEqual(TEXT_MIN);
        expect(contrast(p.muted, stop)).toBeGreaterThanOrEqual(TEXT_MIN);
        for (const s of STATES) expect(contrast(colourFor(s, theme), stop)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      }
    }
  });

  it("holds for surface, ink, Alive against Restless, distinct states and six-digit hex tokens", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      for (const fg of [p.text, p.muted]) expect(contrast(fg, p.surface)).toBeGreaterThanOrEqual(TEXT_MIN);
      for (const fg of [p.focus, p.border]) expect(contrast(fg, p.surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      for (const s of STATES) expect(contrast(p.ink, colourFor(s, theme)), `ink on ${s}`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(contrast(colourFor("Alive", theme), colourFor("Restless", theme))).toBeGreaterThanOrEqual(1.5);
      expect(new Set(STATES.map((s) => colourFor(s, theme))).size).toBe(5);
      const tokens = [
        p.skyTop, p.skyMid, p.skyHorizon, p.groundTop, p.bg, p.horizon, p.moon, p.fog, p.surface, p.text,
        p.muted, p.border, p.focus, p.ring, p.ghost, p.ink, p.pit, p.star, p.starFar, p.grassDark,
        p.grassLight, p.field, p.accentBg, p.accentText, p.wordmark, p.marker, ...STATES.map((s) => colourFor(s, theme)),
      ];
      for (const t of tokens) expect(t).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the Theme keys identical and the CSS free of scheme queries, url() and decoration tokens", () => {
    expect(PALETTE.light).toBe(PALETTE.dark);
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).not.toMatch(/prefers-color-scheme/);
    // Spec cemetery-undead, Deliberate test change 25: url() only in @font-face, only to /fonts/<file>.woff2.
    expect(css.replace(/@font-face\s*\{[^}]*\}/g, "")).not.toMatch(/url\(/);
    for (const m of css.matchAll(/url\(([^)]*)\)/g)) expect(m[1]).toMatch(/^"\/fonts\/[a-z0-9-]+\.woff2"$/);
    expect(css).not.toMatch(/--(horizon|moon|fog|star|star-far|grass-dark|grass-light)\b/);
    for (const file of sourceFiles(resolve(process.cwd(), "src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/prefers-color-scheme/);
    }
  });
});

describe("open grave contrast", () => {
  it("reads the lid against the pit at least 3 to 1, and the pit rim (border) against the pit and the ground", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      expect(contrast(colourFor("Possessed", theme), p.pit)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      expect(contrast(p.border, p.pit)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      expect(contrast(p.border, p.groundTop)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      expect(luminance(p.pit)).toBeLessThan(luminance(p.groundTop));
      expect(luminance(p.pit)).toBeLessThan(luminance(p.bg));
    }
  });
});

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
        for (const back of [p.surface, ...backdropStops(theme)]) expect(contrast(fg, back)).toBeGreaterThanOrEqual(TEXT_MIN);
      }
    }
  });

  it("state colours, ghost, selection ring, focus and border are at least 3 to 1 against bg", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      const colours: Record<string, string> = { ghost: p.ghost, ring: p.ring, focus: p.focus, border: p.border };
      for (const state of STATES) colours[state] = colourFor(state, theme);
      for (const [name, colour] of Object.entries(colours)) {
        for (const back of backdropStops(theme)) {
          expect(contrast(colour, back), `${theme} ${name} on ${back}`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
        }
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

  it("header gradient stops: text and muted at least 4.5, border at least 3 against skyTop, skyMid and bg", () => {
    for (const theme of THEMES) {
      const p = PALETTE[theme];
      for (const stop of [p.skyTop, p.skyMid]) {
        for (const fg of [p.text, p.muted]) expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(TEXT_MIN);
      }
      for (const back of [p.skyTop, p.bg]) expect(contrast(p.border, back)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
  });

  it("every pair that styles.css builds from custom properties meets its minimum, in both themes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const vars = (theme: "light" | "dark"): Record<string, string> => cssVariables(theme);
    // Spec clean-site, task 3: a chrome text token with no background in its rule sits on the chrome backgrounds; the
    // chrome lines (--ui-line, --ui-line2) are decorative separators. Every control they
    // edge is named by its text or fill, so they are not held to 3:1.
    const canvasBackgrounds = ["--bg", "--surface"];
    const chromeBackgrounds = ["--ui-bg", "--ui-bg2", "--ui-panel", "--ui-panel2"];
    const DECORATIVE = new Set(["--ui-line", "--ui-line2"]);
    let checked = 0;
    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = block[2] ?? "";
      const fg = /(?:^|[;\s])color:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      const bgVar = /background:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      // A colour-mix edge is a tinted pill border (the tags and the gold button), decorative like the chrome lines.
      const edges = [...body.matchAll(/(?:border[a-z-]*|outline):([^;]*)var\((--[a-z-]+)\)/g)]
        .filter((m) => !(m[1] ?? "").includes("color-mix"))
        .map((m) => m[2] ?? "")
        .filter((e) => !DECORATIVE.has(e) && e !== bgVar); // an edge in the fill's own colour draws no boundary
      const backgrounds = fg?.startsWith("--ui-") === true || edges.some((e) => e.startsWith("--ui-")) ? chromeBackgrounds : canvasBackgrounds;
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

describe("Feature: cemetery-time, Property 23: The marker colour keeps the contrast", () => {
  it("keeps at least 3 to 1 on every Backdrop stop, is lower-case six-digit hex and differs from the State and ghost colours", () => {
    fc.assert(
      fc.property(arbTheme, fc.nat({ max: 9 }), (theme, stopIndex) => {
        const p = PALETTE[theme];
        const stop = backdropStops(theme)[stopIndex] as string;
        expect(p.marker).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrast(p.marker, stop), `${p.marker} on ${stop}`).toBeGreaterThanOrEqual(NON_TEXT_MIN);
        for (const s of STATES) expect(p.marker).not.toBe(colourFor(s, theme));
        expect(p.marker).not.toBe(p.ghost);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
