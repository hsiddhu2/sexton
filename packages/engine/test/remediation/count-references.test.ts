// countReferences. Spec: .kiro/specs/cli-and-action, Requirements 2.1 to 2.4. Property 46.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countReferences, isCountedPath } from "../../src/remediation/count-references.js";

const arbName = fc.oneof(
  fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/),
  fc.tuple(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/), fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/)).map(([s, n]) => `@${s}/${n}`),
);

const FORMS: readonly ((n: string) => { path: string; text: string } | { script: string })[] = [
  (n) => ({ path: "src/a.js", text: `const x = require("${n}");` }),
  (n) => ({ path: "src/a.ts", text: `import x from '${n}';` }),
  (n) => ({ path: "src/a.mjs", text: "const m = await import(`" + n + "`);" }),
  (n) => ({ path: "src/a.tsx", text: `import y from "${n}/sub/path";` }),
  (n) => ({ path: "src/a.scss", text: `@import "~${n}/x";` }),
  (n) => ({ path: "src/a.less", text: `@import "~${n}";` }),
  (n) => ({ path: "src/b.scss", text: `@import '~${n}';` }),
  (n) => ({ path: "src/c.sass", text: "@use `~" + n + "`" }),
  // Fixed words are upper-case or not name-shaped, so a generated name (lower-case, starting with a letter) never matches them.
  (n) => ({ path: "config/jest.config.json", text: `{ "Preset": "${n}" }` }),
  (n) => ({ path: ".github/w.yml", text: `run: npx '${n}'` }),
  (n) => ({ script: `${n} --flag` }),
  (n) => ({ script: `X=1 && ${n}` }),
];

function run(form: { path: string; text: string } | { script: string }, name: string): number {
  const files = "path" in form ? [form] : [];
  const scripts = new Map("script" in form ? [["s", form.script]] : []);
  return countReferences(files, scripts, [name]).get(name) ?? -1;
}

describe("Feature: cli-and-action, Property 46: countReferences completeness and precision", () => {
  it("finds every listed form", () => {
    fc.assert(
      fc.property(arbName, fc.integer({ min: 0, max: FORMS.length - 1 }), (name, i) => {
        expect(run((FORMS[i] as (n: string) => { path: string; text: string } | { script: string })(name), name)).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it("never matches a longer name that contains the searched name", () => {
    fc.assert(
      fc.property(
        arbName.filter((n) => !n.startsWith("@")),
        fc.constantFrom((n: string) => `${n}-es`, (n: string) => `@x/${n}`, (n: string) => `${n}2`, (n: string) => `x${n}`, (n: string) => `${n}.js`),
        fc.integer({ min: 0, max: FORMS.length - 1 }),
        (name, longer, i) => {
          expect(run((FORMS[i] as (n: string) => { path: string; text: string } | { script: string })(longer(name)), name)).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("never counts package.json, lockfiles or ignored directories", () => {
    fc.assert(
      fc.property(arbName, fc.constantFrom("package.json", "a/package.json", "package-lock.json", "npm-shrinkwrap.json", "node_modules/x/a.js", "dist/a.js", "a/.git/x.json", "build/a.css", "coverage/a.html"), (name, path) => {
        expect(countReferences([{ path, text: `require("${name}")` }], new Map(), [name]).get(name)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe("countReferences examples", () => {
  it("counts a line once per name and ignores other extensions", () => {
    const counts = countReferences(
      [
        { path: "a.js", text: 'require("lodash"); require("lodash/fp")\nimport "lodash-es"' },
        { path: "README.md", text: 'require("lodash")' },
        { path: "b.vue", text: "import x from 'left-pad'" },
      ],
      new Map([["build", "webpack --config x"], ["lint", "eslint-plugin-x ."]]),
      ["lodash", "left-pad", "webpack", "eslint", "unused"],
    );
    expect(Object.fromEntries(counts)).toEqual({ lodash: 1, "left-pad": 1, webpack: 1, eslint: 0, unused: 0 });
  });

  it("knows the counted extensions", () => {
    expect(isCountedPath("src/a.svelte")).toBe(true);
    expect(isCountedPath("src/a.md")).toBe(false);
    expect(isCountedPath("tsconfig.json")).toBe(true);
  });
});
