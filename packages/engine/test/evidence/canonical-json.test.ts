// Spec: .kiro/specs/evidence-pack, Requirements 1.1 to 1.4. Properties 30 and 31 (key order).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson, cleanJsonCopy } from "../../src/evidence/canonical-json.js";
import { arbJsonValue, reorderKeys } from "./arbitraries.js";

describe("canonicalJson examples", () => {
  it("sorts keys by UTF-16 code units, recursively, with no white space", () => {
    // RFC 8785 section 3.2.3 sorting example: "€" (U+20AC) sorts after "😀" (D83D) is false: 20AC < D83D.
    const value = { "€": "Euro", "\r": "cr", "😀": "smiley", "1": "one", "ö": "o", b: [3, { z: 1, a: 2 }] };
    expect(canonicalJson(value)).toBe('{"\\r":"cr","1":"one","b":[3,{"a":2,"z":1}],"ö":"o","€":"Euro","😀":"smiley"}');
  });

  it("writes numbers as JSON.stringify does (RFC 8785 Appendix B samples)", () => {
    expect(canonicalJson([1e30, 5e-324, 333333333.3333333, -0, 0.000001, 1e-7, 4.5, 9007199254740991])).toBe(
      "[1e+30,5e-324,333333333.3333333,0,0.000001,1e-7,4.5,9007199254740991]",
    );
  });

  it("writes strings as JSON.stringify does", () => {
    expect(canonicalJson("\u0000\b\t\n\f\r\"\\\u001f\u007f ")).toBe(JSON.stringify("\u0000\b\t\n\f\r\"\\\u001f\u007f "));
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["lone high surrogate", "a\ud800"],
    ["lone low surrogate", "\udc00b"],
    ["lone surrogate key", { "\ud800": 1 }],
    ["undefined", undefined],
    ["undefined value", { a: undefined }],
    ["array hole", new Array<number>(2)],
    ["function", () => 1],
    ["bigint", 1n],
    ["date", new Date(0)],
    ["map", new Map()],
    ["class instance", new (class X {
      readonly a = 1;
    })()],
    ["getter", Object.defineProperty({}, "a", { get: () => 1, enumerable: true })],
    ["symbol key", { [Symbol("s")]: 1 }],
  ])("returns null for %s", (_label, value) => {
    expect(canonicalJson(value)).toBeNull();
  });

  it("returns null for a cycle, and accepts a shared non-cyclic reference", () => {
    const a: Record<string, unknown> = {};
    a["self"] = a;
    expect(canonicalJson(a)).toBeNull();
    const shared = { x: 1 };
    expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it("keeps __proto__ as an ordinary key", () => {
    const value = JSON.parse('{"__proto__":{"a":1},"b":2}') as unknown;
    expect(canonicalJson(value)).toBe('{"__proto__":{"a":1},"b":2}');
  });
});

describe("cleanJsonCopy", () => {
  it("replaces lone surrogates, drops undefined keys, copies deeply", () => {
    const input = { a: "x\ud800", b: undefined, "\udc00": [1, { c: "\udfff" }] };
    const result = cleanJsonCopy(input);
    expect(result).toEqual({ ok: true, value: { a: "x�", "�": [1, { c: "�" }] } });
    if (result.ok) expect(canonicalJson(result.value)).not.toBeNull();
    expect(input.a).toBe("x\ud800");
  });

  it.each([
    ["NaN", { a: Number.NaN }],
    ["key collision after cleaning", { "\ud800": 1, "�": 2 }],
    ["function", { f: () => 1 }],
    ["undefined in an array", [undefined]],
  ])("fails for %s", (_label, value) => {
    expect(cleanJsonCopy(value)).toEqual({ ok: false });
  });
});

describe("Feature: evidence-pack, Property 30: Canonical round trip and idempotence", () => {
  it("parses back to an equal value and canonicalises to the same text", () => {
    fc.assert(
      fc.property(arbJsonValue, (value) => {
        const text = canonicalJson(value);
        expect(text).not.toBeNull();
        const parsed = JSON.parse(text as string) as unknown;
        expect(parsed).toEqual(value);
        expect(canonicalJson(parsed)).toBe(text);
        const clean = cleanJsonCopy(value);
        expect(clean.ok && canonicalJson(clean.value)).toBe(text);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: evidence-pack, Property 31: Key order does not change the digest (canonical text)", () => {
  it("gives the same text for any key order", () => {
    fc.assert(
      fc.property(arbJsonValue, (value) => {
        expect(canonicalJson(reorderKeys(value))).toBe(canonicalJson(value));
      }),
      { numRuns: 100 },
    );
  });
});
