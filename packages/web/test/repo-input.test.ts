// Spec clean-site, design C2 and Property 3: repository input normalises or is refused (1.11, 1.12).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normaliseRepo } from "../src/header/repo-input.js";

const RUNS = 1000;
const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const arbAlnum = fc.constantFrom(...ALNUM);

/** GitHub's owner rule: letters and digits with single inner hyphens, up to 39 characters. */
const arbOwner = fc
  .array(fc.tuple(fc.boolean(), arbAlnum), { minLength: 0, maxLength: 19 })
  .chain((rest) => arbAlnum.map((first) => first + rest.map(([dash, c]) => (dash ? `-${c}` : c)).join("")))
  .filter((o) => o.length <= 39);
/** GitHub's name rule: letters, digits, -, _ and ., up to 100 characters, not . or .., not ending in .git. */
const arbName = fc
  .array(fc.constantFrom(...ALNUM, "-", "_", "."), { minLength: 1, maxLength: 100 })
  .map((cs) => cs.join(""))
  .filter((n) => n !== "." && n !== ".." && !/\.git$/i.test(n));

const OWNER_ORACLE = /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/;
const NAME_ORACLE = /^[A-Za-z0-9._-]{1,100}$/;

describe("Feature: clean-site, Property 3: Repository input normalises or is refused", () => {
  it("gives https://github.com/owner/name for every accepted shape, and its own output is a fixed point", () => {
    fc.assert(
      fc.property(
        arbOwner,
        arbName,
        fc.constantFrom("", "https://github.com/", "https://www.github.com/", "http://github.com/", "github.com/", "HTTPS://GitHub.com/"),
        fc.constantFrom("", "/", ".git", ".git/"),
        fc.constantFrom("", " ", "  \t"),
        (owner, name, prefix, suffix, pad) => {
          const out = normaliseRepo(`${pad}${prefix}${owner}/${name}${suffix}${pad}`);
          const url = `https://github.com/${owner}/${name}`;
          expect(out).toEqual({ ok: true, url, label: `${owner}/${name}` });
          expect(normaliseRepo(url)).toEqual(out);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("accepts nothing whose owner and name break GitHub's rules, for any string", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 120 }), fc.fullUnicodeString({ maxLength: 60 })), (input) => {
        const out = normaliseRepo(input);
        if (!out.ok) return;
        const [owner, name, ...more] = out.label.split("/");
        expect(more).toEqual([]);
        expect(owner !== undefined && owner.length <= 39 && OWNER_ORACLE.test(owner)).toBe(true);
        expect(name !== undefined && NAME_ORACLE.test(name) && name !== "." && name !== "..").toBe(true);
        expect(out.url).toBe(`https://github.com/${out.label}`);
        expect(normaliseRepo(out.url)).toEqual(out);
      }),
      { numRuns: RUNS },
    );
  });

  it("refuses an owner or name with one character outside the allowed set", () => {
    fc.assert(
      fc.property(
        arbOwner,
        arbName,
        fc.constantFrom(" ", "?", "#", "%", "@", ":", "\\", "<", "é", "\u0000", "\n", "/x"),
        fc.boolean(),
        fc.nat(),
        (owner, name, bad, inOwner, at) => {
          const target = inOwner ? owner : name;
          const i = at % (target.length + 1);
          const broken = target.slice(0, i) + bad + target.slice(i);
          const input = inOwner ? `${broken}/${name}` : `${owner}/${broken}`;
          // A trailing "/" or a split that leaves an exact owner/name is the one bad value that still reads as a shape.
          fc.pre(!(bad === "/x" && !inOwner && i === target.length));
          fc.pre(!(bad === " " && (i === 0 || i === target.length)));
          fc.pre(!(bad === "\n" && (i === 0 || i === target.length)));
          expect(normaliseRepo(input)).toEqual({ ok: false });
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("repository input examples", () => {
  it("refuses the shapes that are not a repository", () => {
    for (const bad of [
      "",
      "   ",
      "owner",
      "owner/",
      "/name",
      "a/b/c",
      "https://github.com/a/b/tree/main",
      "https://github.com/a/b?tab=readme",
      "https://github.com/a/b#top",
      "https://gitlab.com/a/b",
      "https://github.com.evil.com/a/b",
      "ftp://github.com/a/b",
      "-a/b",
      "a-/b",
      "a--b/c",
      "a_b/c",
      "a/.",
      "a/..",
      "a/.git",
      "a/b.git.git",
      `${"a".repeat(40)}/b`,
      `a/${"b".repeat(101)}`,
      "a b/c",
    ]) {
      expect(normaliseRepo(bad), bad).toEqual({ ok: false });
    }
  });

  it("accepts the examples of the Scan field", () => {
    expect(normaliseRepo("hsiddhu2/sexton-demo")).toEqual({ ok: true, url: "https://github.com/hsiddhu2/sexton-demo", label: "hsiddhu2/sexton-demo" });
    expect(normaliseRepo("https://github.com/expressjs/express.git")).toMatchObject({ url: "https://github.com/expressjs/express" });
    expect(normaliseRepo("www.github.com/facebook/react/")).toMatchObject({ url: "https://github.com/facebook/react" });
    expect(normaliseRepo(`${"a".repeat(39)}/${"b".repeat(100)}`).ok).toBe(true);
  });
});
