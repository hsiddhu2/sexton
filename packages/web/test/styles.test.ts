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
    for (const selector of [".inspector-name", ".drawer h2", ".pr-preview"]) {
      expect(rulesFor(selector).some((r) => /overflow-wrap:\s*anywhere/.test(r.body)), selector).toBe(true);
    }
  });

  // Spec clean-site, 7.1: the Drawer slides in from the right, the one other animation, also off for reduced motion.
  it("declares animation only on .loading-spinner and .drawer and turns both off for reduced motion", () => {
    for (const rule of rules) {
      if (/(^|[^-])animation\s*:/.test(rule.body) && !/animation:\s*none/.test(rule.body)) {
        expect([[".loading-spinner"], [".drawer"]], rule.body).toContainEqual(rule.selectors);
      }
    }
    expect(rulesFor(".loading-spinner").some((r) => /animation:\s*sexton-spin/.test(r.body))).toBe(true);
    expect(rulesFor(".drawer").some((r) => /animation:\s*sexton-drawer-in/.test(r.body))).toBe(true);
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.loading-spinner\s*\{\s*animation:\s*none;?\s*\}\s*\}/;
    expect(css).toMatch(block);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.drawer\s*\{\s*animation:\s*none;?\s*\}\s*\}/);
    expect(css.match(/transition\s*:/g)).toBeNull();
  });

  // Spec clean-site, 1.2: one header row of 64 px in the Wide and Middle layouts.
  it("gives the header one row of 64 px, and lets it wrap under 700 px", () => {
    expect(rulesFor(".site-header").some((r) => /height:\s*64px/.test(r.body))).toBe(true);
    expect(css).toMatch(/@media \(max-width: 699px\)\s*\{\s*\.site-header\s*\{[^}]*flex-wrap:\s*wrap[^}]*height:\s*auto/);
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

  // Spec home-page, 12.11: the Scan field's row starts with the tabs. A full-width empty line after the first row
  // forces the break, and the field fills the rest of its row.
  it("puts the tabs and the Scan field on their own row under 700 px, and lets the field shrink", () => {
    expect(css).toMatch(/@media \(max-width: 699px\)[\s\S]*\.site-header::before\s*\{[^}]*order:\s*2;[^}]*flex-basis:\s*100%/);
    expect(css).toMatch(/@media \(max-width: 699px\)[\s\S]*\.site-tabs\s*\{[^}]*order:\s*3/);
    expect(css).toMatch(/@media \(max-width: 699px\)[\s\S]*\.scan-wrap\s*\{[^}]*flex:\s*1 1 0;[^}]*order:\s*4/);
    expect(rulesFor(".scan-form input").some((r) => /min-width:\s*0/.test(r.body) && /flex:\s*1 1 auto/.test(r.body))).toBe(true);
  });

  // Spec clean-site: the design's 680 px Drawer, full width under 700 px (15.4).
  it("sizes the drawer to min(680px, 100%), and full width under 700 px", () => {
    expect(rulesFor(".drawer").some((r) => /width:\s*min\(680px,\s*100%\)/.test(r.body))).toBe(true);
    expect(css).toMatch(/@media \(max-width: 699px\)\s*\{\s*\.drawer\s*\{\s*width:\s*100%/);
  });

  it("has no url() outside @font-face, no @import, colour literal, scheme query or decoration variable", () => {
    // Spec cemetery-undead, Deliberate test change 25: url() only in @font-face, only to /fonts/<file>.woff2.
    const outsideFaces = css.replace(/@font-face\s*\{[^}]*\}/g, "");
    expect(outsideFaces).not.toMatch(/url\(/);
    for (const m of css.matchAll(/url\(([^)]*)\)/g)) expect(m[1]).toMatch(/^"\/fonts\/[a-z0-9-]+\.woff2"$/);
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

  it("styles the accent buttons with the accent tokens", () => {
    for (const [selector, bg, fg] of [
      [".scan-button", "--ui-accent", "--ui-accent-ink"],
      [".button-primary", "--ui-accent", "--ui-accent-ink"],
      [".drawer-remediate-button", "--ui-accent", "--ui-accent-ink"],
    ] as const) {
      const body = rulesFor(selector)[0]?.body ?? "";
      expect(body, selector).toMatch(new RegExp(`background:\\s*var\\(${bg}\\)`));
      expect(body, selector).toMatch(new RegExp(`(^|[;\\s])color:\\s*var\\(${fg}\\)`));
    }
  });

  // Spec clean-site, task 6.3: Play is the Replay's "Play all" button now, so the Step cards take the old .scrub-play check.
  it("gives .step-card and .visually-hidden no transition and no animation, and .visually-hidden no colour (spec cemetery-time-fixes, 4.8)", () => {
    for (const selector of [".step-card", ".visually-hidden"]) {
      const found = rulesFor(selector);
      expect(found.length, selector).toBeGreaterThan(0);
      for (const r of found) expect(r.body, selector).not.toMatch(/transition|animation/);
    }
    for (const r of rulesFor(".visually-hidden")) expect(r.body).not.toMatch(/color|background|#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  // Review against spec clean-site (D3, D4, D7 and the History dots).
  it("keeps whole words in the Evidence labels and the List, and lets the List scroll sideways inside its own box", () => {
    const has = (selector: string, pattern: RegExp): boolean => rulesFor(selector).some((r) => pattern.test(r.body));
    expect(has(".drawer-signal-label", /white-space:\s*nowrap/)).toBe(true);
    expect(has(".drawer-signals td", /overflow-wrap:\s*anywhere/)).toBe(false);
    expect(has(".list-table td", /overflow-wrap:\s*anywhere/)).toBe(false);
    for (const selector of [".list-table .badge", ".list-open", ".list-version"]) expect(has(selector, /white-space:\s*nowrap/), selector).toBe(true);
    expect(has(".list-table", /min-width:\s*\d+px/)).toBe(true);
    expect(has(".list-view", /overflow:\s*auto/)).toBe(true);
  });

  it("puts Scanning is off in this build. inside the field and dims a disabled Scan button", () => {
    const off = rulesFor(".scan-note.scan-off").map((r) => r.body).join("");
    expect(off).toMatch(/top:\s*0/);
    expect(off).toMatch(/height:\s*40px/);
    expect(off).toMatch(/pointer-events:\s*none/);
    const disabled = rulesFor(".scan-button:disabled").map((r) => r.body).join("");
    expect(disabled).toMatch(/background:\s*var\(--ui-panel2\)/);
    expect(disabled).toMatch(/color:\s*var\(--ui-faint\)/);
  });

  // Spec clean-site, 3.26: the Inspector, the Fix order and the Step panel keep one height at each layout, and the boxes
  // inside them that follow the grave or the Step are clamped, so nothing outside them moves.
  it("gives the Inspector, the Fix order card and the Step panel a fixed height, with their lines clamped", () => {
    for (const selector of [".inspector", ".fix-order", ".step-panel"]) {
      const heights = rulesFor(selector).flatMap((r) => [...r.body.matchAll(/(?:^|[;\s])height:\s*(\d+)px/g)].map((m) => m[1]));
      expect(heights.length, selector).toBeGreaterThanOrEqual(2);
      expect(rulesFor(selector).some((r) => /overflow:\s*hidden/.test(r.body)), selector).toBe(true);
    }
    for (const selector of [".inspector-epitaph", ".inspector-why", ".step-title", ".step-text"]) {
      expect(rulesFor(selector).some((r) => /-webkit-line-clamp:\s*\d/.test(r.body) && /overflow:\s*hidden/.test(r.body)), selector).toBe(true);
    }
    for (const selector of [".inspector-name", ".inspector-version", ".fix-name-text"]) {
      expect(rulesFor(selector).some((r) => /text-overflow:\s*ellipsis/.test(r.body) && /white-space:\s*nowrap/.test(r.body)), selector).toBe(true);
    }
    expect(rulesFor(".inspector > .button-wide").some((r) => /margin-top:\s*auto/.test(r.body))).toBe(true);
    expect(rulesFor(".date-badge").some((r) => /font-variant-numeric:\s*tabular-nums/.test(r.body))).toBe(true);
  });

  it("colours each History dot by its State, above the plain dot rule", () => {
    const plain = css.indexOf(".history li::before");
    expect(plain).toBeGreaterThan(-1);
    for (const state of ["possessed", "dead", "haunted", "restless", "alive"]) {
      expect(rulesFor(`.history li.history-${state}::before`).some((r) => r.body.includes(`var(--state-${state})`)), state).toBe(true);
    }
  });
});
