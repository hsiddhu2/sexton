import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INVALID_URL_MESSAGE, formatRepoUrl, parseRepoUrl } from "../../src/intake/url.js";
import { arbOwner, arbRepo } from "../arbitraries.js";

const PREFIX = "https://github.com/";
const FORBIDDEN = /[\s\p{Cc}?#\\]/u;

const SUFFIXES = ["", ".git", "/", ".git/"] as const;

function forms(owner: string, repo: string, rest: string): string[] {
  const base = `${PREFIX}${owner}/${repo}`;
  return [...SUFFIXES.map((s) => base + s), `${base}/tree/${rest}`, `${base}.git/tree/${rest}`];
}

const INSERTS = ["?", "#", "\\", " ", "\n", "\u00a0", "\u2028", "\u0000", "@", ":", "%"];

const arbNearMiss: fc.Arbitrary<string> = fc
  .tuple(
    arbOwner,
    arbRepo,
    fc.constantFrom(...SUFFIXES),
    fc.constantFrom(...INSERTS),
    fc.nat(),
    fc.constantFrom("insert", "scheme", "www", "suffix-host", "http"),
  )
  .map(([owner, repo, suffix, ch, n, mode]) => {
    const url = `${PREFIX}${owner}/${repo}${suffix}`;
    switch (mode) {
      case "scheme":
        return url.replace("https://", "HTTPS://");
      case "www":
        return url.replace("github.com", "www.github.com");
      case "suffix-host":
        return url.replace("github.com", "github.com.example.invalid");
      case "http":
        return url.replace("https://", "http://");
      default: {
        const at = n % (url.length + 1);
        return url.slice(0, at) + ch + url.slice(at);
      }
    }
  });

describe("Feature: repo-intake, Property 1: The URL parser never throws and is deterministic", () => {
  it("holds for arbitrary and near-miss strings", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.string({ unit: "binary", maxLength: 5000 }), arbNearMiss),
        (input) => {
          const a = parseRepoUrl(input);
          const b = parseRepoUrl(input);
          expect(b).toEqual(a);
          if (a.ok) {
            expect(input.startsWith(PREFIX)).toBe(true);
            expect(FORBIDDEN.test(input)).toBe(false);
          } else {
            expect(a).toEqual({ ok: false, code: "invalid-url", message: INVALID_URL_MESSAGE });
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: repo-intake, Property 2: URL round trip and equivalence of accepted forms", () => {
  const arbRest = fc.stringMatching(/^[A-Za-z0-9._/-]{1,30}$/);

  it("holds over the six forms", () => {
    fc.assert(
      fc.property(arbOwner, arbRepo, arbRest, (owner, repo, rest) => {
        const canonical = formatRepoUrl({ owner, repo });
        const first = parseRepoUrl(canonical);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        expect(first.repo).toEqual({ owner, repo, url: canonical });
        for (const form of forms(owner, repo, rest)) {
          expect(parseRepoUrl(form)).toEqual(first);
        }
        expect(parseRepoUrl(formatRepoUrl(first.repo))).toEqual(first);
      }),
      { numRuns: 100 },
    );
  });
});

describe("parseRepoUrl examples", () => {
  const expected = { ok: true, repo: { owner: "octocat", repo: "hello-world", url: `${PREFIX}octocat/hello-world` } };

  it.each([
    `${PREFIX}octocat/hello-world`,
    `${PREFIX}octocat/hello-world/tree/main`,
    `${PREFIX}octocat/hello-world/tree/feature/x/y`,
    `${PREFIX}octocat/hello-world.git/tree/main`,
    `${PREFIX}octocat/hello-world.git`,
    `${PREFIX}octocat/hello-world/`,
    `${PREFIX}octocat/hello-world.git/`,
  ])("accepts %s", (input) => {
    expect(parseRepoUrl(input)).toEqual(expected);
  });

  it("preserves case", () => {
    const result = parseRepoUrl(`${PREFIX}OctoCat/Hello-World`);
    expect(result).toEqual({
      ok: true,
      repo: { owner: "OctoCat", repo: "Hello-World", url: `${PREFIX}OctoCat/Hello-World` },
    });
  });

  const rejected: [string, string][] = [
    ["http scheme", "http://github.com/o/r"],
    ["uppercase scheme", "HTTPS://github.com/o/r"],
    ["uppercase host", "https://GitHub.com/o/r"],
    ["www host", "https://www.github.com/o/r"],
    ["gist host", "https://gist.github.com/o/r"],
    ["gitlab", "https://gitlab.com/o/r"],
    ["suffix host", "https://github.com.example.invalid/o/r"],
    ["credentials", "https://user@github.com/o/r"],
    ["credentials with password", "https://user:pw@github.com/o/r"],
    ["port", "https://github.com:443/o/r"],
    ["query", "https://github.com/o/r?x=1"],
    ["fragment", "https://github.com/o/r#readme"],
    ["empty segment", "https://github.com/o//r"],
    ["one segment", "https://github.com/o"],
    ["root", "https://github.com/"],
    ["issues", "https://github.com/o/r/issues"],
    ["blob", "https://github.com/o/r/blob/main/x"],
    ["orgs", "https://github.com/orgs/o"],
    ["double .git", "https://github.com/o/r.git.git"],
    ["bare .git", "https://github.com/o/.git"],
    ["tree slash", "https://github.com/o/r/tree/"],
    ["tree", "https://github.com/o/r/tree"],
    ["tree with space", "https://github.com/o/r/tree/a b"],
    ["tab", "https://github.com/o/r\t"],
    ["newline", "https://github.com/o/r\n"],
    ["leading space", " https://github.com/o/r"],
    ["percent encoding", "https://github.com/o%2Fx/r"],
    ["empty string", ""],
    ["10,000 characters", "x".repeat(10_000)],
    ["10,000 character path", `${PREFIX}o/${"r".repeat(10_000)}/x`],
    ["backslash", "https://github.com/o/r\\x"],
    ["no-break space", "https://github.com/o/r\u00a0"],
    ["dotdot owner", "https://github.com/o..x/r"],
    ["leading dot owner", "https://github.com/.o/r"],
    ["double slash tail", "https://github.com/o/r//x"],
  ];

  it.each(rejected)("rejects %s", (_label, input) => {
    expect(parseRepoUrl(input)).toEqual({ ok: false, code: "invalid-url", message: INVALID_URL_MESSAGE });
  });

  it("holds no input in the rejection message", () => {
    expect(INVALID_URL_MESSAGE).not.toContain("github.com/o");
  });

  it("formats the canonical URL", () => {
    expect(formatRepoUrl({ owner: "O", repo: "R" })).toBe("https://github.com/O/R");
  });
});
