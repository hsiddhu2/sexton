import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cssVariables } from "../src/scene/palette.js";

// Task 9.2: static checks on src/styles.css (requirements 6.2, 6.4, 11.2, 13.1, 13.2, 15.2, 15.3, 15.4, 16.2, 16.3, 16.10).
const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

interface Rule {
  readonly selectors: readonly string[];
  readonly body: string;
}

const rules: readonly Rule[] = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: (m[1] ?? "").split(",").map((s) => s.trim()),
  body: m[2] ?? "",
}));

function rulesFor(selector: string): Rule[] {
  return rules.filter((r) => r.selectors.includes(selector));
}

describe("styles.css static checks", () => {
  it("wraps long text with overflow-wrap: anywhere", () => {
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    for (const selector of [".repo-text", ".grave-tooltip", ".drawer h2", ".pr-preview"]) {
      expect(rulesFor(selector).some((r) => /overflow-wrap:\s*anywhere/.test(r.body)), selector).toBe(true);
    }
  });

  it("declares animation only on .loading-spinner and turns it off for reduced motion", () => {
    for (const rule of rules) {
      if (/(^|[^-])animation\s*:/.test(rule.body) && !/animation:\s*none/.test(rule.body)) {
        expect(rule.selectors, rule.body).toEqual([".loading-spinner"]);
      }
    }
    expect(rulesFor(".loading-spinner").some((r) => /animation:\s*sexton-spin/.test(r.body))).toBe(true);
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.loading-spinner\s*\{\s*animation:\s*none;?\s*\}\s*\}/;
    expect(css).toMatch(block);
    expect(css.match(/transition\s*:/g)).toBeNull();
  });

  it("gives .header-summary a min-height", () => {
    expect(rulesFor(".header-summary").some((r) => /min-height:/.test(r.body))).toBe(true);
  });

  it("keeps main free of horizontal padding and gives .panel-main 16px", () => {
    for (const rule of rulesFor("main")) {
      expect(rule.body).not.toMatch(/padding(-left|-right|-inline)?:\s*[1-9]/);
      expect(rule.body).not.toMatch(/padding:\s*0?\s*[1-9]\d*px/);
    }
    expect(rulesFor(".panel-main").some((r) => /padding:\s*16px/.test(r.body))).toBe(true);
  });

  it("draws the grave focus ring 9px inside the cell at 3px", () => {
    const rule = rulesFor(".grave-button:focus-visible")[0];
    expect(rule?.body).toMatch(/outline:\s*3px solid var\(--focus\)/);
    expect(rule?.body).toMatch(/outline-offset:\s*-9px/);
  });

  it("never removes an outline", () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it("stacks the header at 600px and lets the field shrink", () => {
    expect(css).toMatch(/@media \(max-width: 600px\)/);
    expect(rulesFor(".repo-form input").some((r) => /min-width:\s*0/.test(r.body) && /flex:\s*1 1 auto/.test(r.body))).toBe(true);
  });

  it("sizes the drawer to min(32rem, 100%)", () => {
    expect(rulesFor(".drawer").some((r) => /width:\s*min\(32rem,\s*100%\)/.test(r.body))).toBe(true);
  });

  it("has no url(), @import, colour literal, scheme query or decoration variable", () => {
    expect(css).not.toMatch(/url\(/);
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor\(|\btransparent\b/);
    expect(css).not.toMatch(/--(horizon|moon|fog|star|star-far|grass-dark|grass-light)\b/);
  });

  it("uses only variables that cssVariables defines", () => {
    const known = new Set(Object.keys(cssVariables("light")));
    const used = [...css.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1] ?? "");
    expect(used.length).toBeGreaterThan(20);
    for (const name of used) expect(known.has(name), name).toBe(true);
  });

  it("styles the new accent button with the accent tokens", () => {
    for (const selector of [".scan-button", ".drawer-remediate-button"]) {
      const body = rulesFor(selector)[0]?.body ?? "";
      expect(body, selector).toMatch(/background:\s*var\(--accent-bg\)/);
      expect(body, selector).toMatch(/(^|[;\s])color:\s*var\(--accent-text\)/);
    }
  });

  it("gives .scrub-play and .visually-hidden no transition and no animation, and .visually-hidden no colour (spec cemetery-time-fixes, 4.8)", () => {
    for (const selector of [".scrub-play", ".visually-hidden"]) {
      const found = rulesFor(selector);
      expect(found.length, selector).toBeGreaterThan(0);
      for (const r of found) expect(r.body, selector).not.toMatch(/transition|animation/);
    }
    for (const r of rulesFor(".visually-hidden")) expect(r.body).not.toMatch(/color|background|#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
