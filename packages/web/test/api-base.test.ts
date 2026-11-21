import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseApiBase } from "../src/load/api-base.js";

describe("parseApiBase", () => {
  it("accepts a valid https value", () => {
    expect(parseApiBase("https://api.sexton.example")).toBe("https://api.sexton.example");
    expect(parseApiBase("https://api.sexton.example/v1")).toBe("https://api.sexton.example/v1");
  });
  it("strips one trailing slash", () => {
    expect(parseApiBase("https://api.sexton.example/")).toBe("https://api.sexton.example");
    expect(parseApiBase("https://api.sexton.example/v1/")).toBe("https://api.sexton.example/v1");
  });
  it("returns null for absent, empty and invalid values", () => {
    expect(parseApiBase(undefined)).toBeNull();
    expect(parseApiBase("")).toBeNull();
    expect(parseApiBase("not a url")).toBeNull();
  });
  it("rejects http, query, fragment, bare question mark and credentials", () => {
    expect(parseApiBase("http://api.sexton.example")).toBeNull();
    expect(parseApiBase("https://api.sexton.example/?a=1")).toBeNull();
    expect(parseApiBase("https://api.sexton.example/#x")).toBeNull();
    expect(parseApiBase("https://api.sexton.example/?")).toBeNull();
    expect(parseApiBase("https://user:pw@api.sexton.example")).toBeNull();
    expect(parseApiBase("https://user@api.sexton.example")).toBeNull();
  });
  it.each([
    ["/api", "/api"],
    ["/api/", "/api"],
    ["/v1/api", "/v1/api"],
  ])("accepts the path base %j", (raw, expected) => {
    expect(parseApiBase(raw)).toBe(expected);
  });
  it.each(["/", "//", "//host", "/api//x", "/a\\b", "/a?x", "/a#x", "/a/../b", "/a/./b", "/a%2e%2e/b", "/a b", "/api\n"])(
    "rejects the path base %j",
    (raw) => {
      expect(parseApiBase(raw)).toBeNull();
    },
  );
});

const arbTokens = fc
  .array(fc.constantFrom("/", "//", "..", ".", "?", "#", "\\", " ", "%2e", "api", "v1", "https://"), { maxLength: 8 })
  .map((parts) => parts.join(""));
const arbSegment = fc.stringMatching(/^[A-Za-z0-9._~-]{1,8}$/).filter((s) => s !== "." && s !== ".." && !s.includes(".."));
const arbValidPath = fc.array(arbSegment, { minLength: 1, maxLength: 4 }).map((segs) => `/${segs.join("/")}`);

describe("parseApiBase properties", () => {
  it(
    "Feature: cemetery-theme, Property 9: parseApiBase is total and safe",
    () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.webUrl(), arbTokens, arbValidPath), (raw) => {
          const out = parseApiBase(raw);
          if (out === null) return;
          if (out.startsWith("/")) {
            expect(out.endsWith("/")).toBe(false);
            expect(out.startsWith("//")).toBe(false);
            expect(out).not.toMatch(/\/\/|\.\.|[?#\\\s%]/);
          } else {
            const u = new URL(out);
            expect(u.protocol).toBe("https:");
            expect(u.username + u.password + u.search + u.hash).toBe("");
          }
        }),
        { numRuns: 1000 },
      );
      fc.assert(
        fc.property(arbValidPath, fc.boolean(), (path, slash) => {
          expect(parseApiBase(slash ? `${path}/` : path)).toBe(path);
        }),
        { numRuns: 1000 },
      );
    },
    60000,
  );
});
