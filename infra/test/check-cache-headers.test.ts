// Spec fresh-site, Property 7 and Requirement 2.7: the cache header check script.
// No network: main is never called, and it does not run on import.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ASSET_CACHE_CONTROL, WEB_CACHE_CONTROL } from "../lib/web-cache-headers.js";
import { ASSET_FALLBACK_PATH, FALLBACK_PATH, checkPaths, exitStatus, findHashedAsset, verdict, type Verdict } from "../scripts/check-cache-headers.js";

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <link rel="preload" href="/fonts/pirata-one-400.woff2" as="font" type="font/woff2" crossorigin />
    <script type="module" crossorigin src="/assets/index-rdKLS1Oq.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-Bx1yZ2cD.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("check script examples (2.7)", () => {
  it("finds the hashed script that index.html loads", () => {
    expect(findHashedAsset(INDEX_HTML)).toBe("/assets/index-rdKLS1Oq.js");
    expect(findHashedAsset("<!doctype html><title>x</title>")).toBeNull();
    expect(findHashedAsset('<script src="https://cdn.example/assets/x.js"></script>')).toBeNull();
  });

  it("checks the root, index.html, the demo scan, a replay, the asset and the fallback path", () => {
    expect(checkPaths("/assets/index-rdKLS1Oq.js")).toEqual([
      "/",
      "/index.html",
      "/demo/scan.json",
      "/replay/axios.json",
      "/assets/index-rdKLS1Oq.js",
      FALLBACK_PATH,
      ASSET_FALLBACK_PATH,
    ]);
  });

  it("passes the expected values, fails a missing or different header, and reports the fallback as INFO", () => {
    expect(verdict("/index.html", "no-cache")).toBe("PASS");
    expect(verdict("/demo/scan.json", null)).toBe("FAIL");
    expect(verdict("/replay/axios.json", "max-age=86400")).toBe("FAIL");
    expect(verdict("/assets/index-rdKLS1Oq.js", "public, max-age=31536000, immutable")).toBe("PASS");
    expect(verdict("/assets/index-rdKLS1Oq.js", "no-cache")).toBe("FAIL");
    expect(verdict(FALLBACK_PATH, null)).toBe("INFO");
    expect(verdict(FALLBACK_PATH, "no-cache")).toBe("INFO");
    expect(verdict(ASSET_FALLBACK_PATH, ASSET_CACHE_CONTROL)).toBe("INFO");
  });

  it("accepts known spellings of the expected values and refuses reordered or partial ones", () => {
    for (const value of ["No-Cache", " no-cache ", "NO-CACHE"]) expect(verdict("/index.html", value), value).toBe("PASS");
    for (const value of ["Public, Max-Age=31536000, Immutable", "public,max-age=31536000,immutable", "public ,  max-age=31536000 , immutable"]) {
      expect(verdict("/assets/a-1.js", value), value).toBe("PASS");
    }
    for (const value of ["no-cache, no-store", "no-store", "max-age=0", "public, max-age=31536000", "immutable, public, max-age=31536000"]) {
      expect(verdict(value.includes("31536000") ? "/assets/a-1.js" : "/index.html", value), value).toBe("FAIL");
    }
  });

  it("exits 1 only when a checked path fails", () => {
    expect(exitStatus(["PASS", "PASS", "INFO"])).toBe(0);
    expect(exitStatus(["PASS", "FAIL", "INFO"])).toBe(1);
    expect(exitStatus([])).toBe(0);
  });
});

const directive = fc.stringMatching(/^[A-Za-z0-9=-]{1,12}$/);
const respace = (value: string, gaps: readonly string[]): string =>
  value
    .split(", ")
    .map((d, i) => (i % 2 === 0 ? d.toUpperCase() : d))
    .join(`${gaps[0] ?? ""},${gaps[1] ?? " "}`);

describe("Feature: fresh-site, Property 7: the check verdict is exact", () => {
  const checked = fc.oneof(
    fc.constantFrom("/", "/index.html", "/demo/scan.json", "/replay/axios.json", "/fonts/x.woff2"),
    directive.map((d) => `/assets/${d}.js`),
  );
  const gaps = fc.array(fc.constantFrom("", " ", "  "), { minLength: 2, maxLength: 2 });

  it("is PASS exactly for the expected directives, in order, ignoring case and spacing", () => {
    fc.assert(
      fc.property(
        checked,
        fc.oneof(
          fc.tuple(fc.constantFrom(WEB_CACHE_CONTROL, ASSET_CACHE_CONTROL), gaps).map(([v, g]) => respace(v, g)),
          fc.array(directive, { minLength: 1, maxLength: 4 }).map((d) => d.join(", ")),
          fc.constant("immutable, max-age=31536000, public"),
          fc.constant(""),
        ),
        fc.constantFrom("", " ", "\t"),
        (path, value, pad) => {
          const expected = path.startsWith("/assets/") ? ASSET_CACHE_CONTROL : WEB_CACHE_CONTROL;
          const same =
            value.split(",").map((d) => d.trim().toLowerCase()).join(", ") === expected;
          expect(verdict(path, `${pad}${value}${pad}`)).toBe(same ? "PASS" : "FAIL");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("is INFO for the fallback path whatever the header, and exit 1 exactly when another verdict is FAIL", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), fc.array(fc.constantFrom<Verdict>("PASS", "FAIL"), { maxLength: 6 }), (header, others) => {
        expect(verdict(ASSET_FALLBACK_PATH, header)).toBe("INFO");
        const fallback = verdict(FALLBACK_PATH, header);
        expect(fallback).toBe("INFO");
        expect(exitStatus([...others, fallback])).toBe(others.includes("FAIL") ? 1 : 0);
      }),
      { numRuns: 100 },
    );
  });
});
