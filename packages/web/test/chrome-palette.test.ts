// Spec clean-site, design C14 and requirements 5.4, 5.7 to 5.10: the chrome tokens pass AA on every background they
// sit on, the gold accent stays apart from Restless, the hover ring keeps the ring rules, and the new fonts ship as
// woff2 files with their OFL files under public/fonts.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STATES } from "../src/load/lists.js";
import { cssVariables, PALETTE } from "../src/scene/palette.js";
import { contrast, deltaE2000, labOf } from "./support/colour.js";

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;
const ACCENT_MIN_DELTA_E = 10;

describe("chrome palette", () => {
  for (const theme of ["light", "dark"] as const) {
    const p = PALETTE[theme];
    const backs = { uiBg: p.uiBg, uiBg2: p.uiBg2, uiPanel: p.uiPanel, uiPanel2: p.uiPanel2 };
    const texts = { uiText: p.uiText, uiMuted: p.uiMuted, uiFaint: p.uiFaint, uiAccent: p.uiAccent, ...Object.fromEntries(STATES.map((s) => [s, p.states[s]])) };

    it(`holds every chrome text token at 4.5:1 on every chrome background (${theme})`, () => {
      for (const [tn, fg] of Object.entries(texts)) {
        for (const [bn, bg] of Object.entries(backs)) expect(contrast(fg, bg), `${tn} ${fg} on ${bn} ${bg}`).toBeGreaterThanOrEqual(TEXT_MIN);
      }
      expect(contrast(p.uiAccentInk, p.uiAccent), "uiAccentInk on uiAccent").toBeGreaterThanOrEqual(TEXT_MIN);
    });

    it(`keeps the accent, which draws the focus outlines, at 3:1 on the chrome (${theme})`, () => {
      for (const bg of Object.values(backs)) expect(contrast(p.uiAccent, bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    });

    it(`keeps the gold accent at least 10 apart in CIEDE2000 from Restless (${theme})`, () => {
      expect(deltaE2000(labOf(p.uiAccent), labOf(p.states.Restless))).toBeGreaterThanOrEqual(ACCENT_MIN_DELTA_E);
    });

    it(`holds the hover ring at 3:1 against ink, apart from the selection ring (${theme})`, () => {
      expect(contrast(p.ringHover, p.ink)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      expect(p.ringHover).not.toBe(p.ring);
    });
  }

  it("writes every chrome token as six-digit hex and offers each as a custom property", () => {
    const p = PALETTE.dark;
    const tokens = [p.ringHover, p.uiBg, p.uiBg2, p.uiPanel, p.uiPanel2, p.uiLine, p.uiLine2, p.uiText, p.uiMuted, p.uiFaint, p.uiAccent, p.uiAccentInk];
    for (const t of tokens) expect(t).toMatch(/^#[0-9a-f]{6}$/);
    const vars = cssVariables("dark");
    for (const t of tokens) expect(Object.values(vars)).toContain(t);
    expect(vars["--ui-accent"]).toBe(p.uiAccent);
    expect(vars["--ring-hover"]).toBe(p.ringHover);
  });

  it("checks the CIEDE2000 helper against a reference pair of Sharma, Wu and Dalal 2005", () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE2000([50, 2.5, 0], [56, -27, -3])).toBeCloseTo(31.903, 3);
  });
});

describe("Inter and Cormorant Garamond files (5.4)", () => {
  const FONTS = join(resolve(process.cwd()), "public", "fonts");
  const FILES: Readonly<Record<string, string>> = {
    "inter-variable.woff2": "OFL-inter.txt",
    "cormorant-garamond-600.woff2": "OFL-cormorantgaramond.txt",
  };

  it("holds each woff2 file with its SIL Open Font License beside it", () => {
    for (const [font, licence] of Object.entries(FILES)) {
      expect(readFileSync(join(FONTS, font)).subarray(0, 4).toString("latin1"), font).toBe("wOF2");
      expect(readFileSync(join(FONTS, licence), "utf8")).toContain("SIL Open Font License, Version 1.1");
    }
  });
});
