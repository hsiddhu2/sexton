// Bounds on Outside text. Spec: .kiro/specs/sexton-power, Requirement 10, Property 4 on the module alone.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boundValue, capList, clean, limitResult, MAX, type Cut } from "../src/bound.js";

/** The removed classes: C0, DEL, C1, line and paragraph separators, bidirectional controls and marks, lone surrogates. */
// eslint-disable-next-line no-control-regex
export const REMOVED = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export const hostileString = fc.oneof(fc.string({ unit: "binary", maxLength: 400 }), fc.string({ maxLength: 400 }), fc.constantFrom("a\nb", "\u202Eevil", "\u0000x", "\ud800", "```\n# heading\n```", '{"ok":true}', "x".repeat(5000)));

describe("clean", () => {
  it("Property 4: no removed character and at most max code points, for any string", () => {
    fc.assert(
      fc.property(hostileString, fc.constantFrom(...Object.values(MAX)), (value, max) => {
        const text = clean(value, max);
        expect(REMOVED.test(text)).toBe(false);
        expect(Array.from(text).length).toBeLessThanOrEqual(max);
      }),
      { numRuns: 1000 },
    );
  });
  it("cuts a 1 MiB string", () => {
    expect(Array.from(clean("é".repeat(1024 * 1024), MAX.reason)).length).toBeLessThanOrEqual(MAX.reason);
  });
});

describe("capList", () => {
  it("keeps the first cap items and flags a cut", () => {
    expect(capList([1, 2, 3], 2)).toEqual({ items: [1, 2], truncated: true });
    expect(capList([1, 2], 2)).toEqual({ items: [1, 2], truncated: false });
  });
});

describe("boundValue", () => {
  it("drops keys outside the identifier pattern, caps lists, keys and depth, and cleans strings", () => {
    const cut: Cut = { truncated: false };
    const value = { good: "a\nb", "bad key": 1, "x\nsy": 2, list: Array.from({ length: 50 }, (_, i) => i), deep: { a: { b: { c: { d: 1 } } } } };
    const out = boundValue(value, cut) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["deep", "good", "list"]);
    expect(out["good"]).toBe("a b");
    expect((out["list"] as unknown[]).length).toBe(20);
    expect(cut.truncated).toBe(true);
  });
  it("Property 4: for any JSON-like value, every key matches the pattern and no string holds a removed character", () => {
    const keyOf = fc.string({ maxLength: 12 });
    const json = fc.letrec((tie) => ({
      value: fc.oneof({ maxDepth: 5 }, fc.constant(null), fc.boolean(), fc.double(), hostileString, fc.array(tie("value"), { maxLength: 30 }), fc.dictionary(keyOf, tie("value"), { maxKeys: 40 })),
    })).value;
    const walk = (node: unknown): void => {
      if (typeof node === "string") {
        expect(REMOVED.test(node)).toBe(false);
        expect(Array.from(node).length).toBeLessThanOrEqual(MAX.other);
      } else if (Array.isArray(node)) {
        expect(node.length).toBeLessThanOrEqual(20);
        node.forEach(walk);
      } else if (typeof node === "object" && node !== null) {
        const keys = Object.keys(node);
        expect(keys.length).toBeLessThanOrEqual(30);
        for (const k of keys) expect(/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)).toBe(true);
        Object.values(node).forEach(walk);
      }
    };
    fc.assert(fc.property(json, (value) => walk(boundValue(value, { truncated: false }))), { numRuns: 1000 });
  });
});

describe("limitResult", () => {
  it("leaves a small object alone", () => {
    const o = { ok: true, list: [1, 2] };
    expect(limitResult(o, 1000).object).toBe(o);
  });
  it("drops items from the end of the largest list until it fits and sets truncated", () => {
    const o = { ok: true, packages: Array.from({ length: 2000 }, (_, i) => ({ name: `package-${String(i)}`, reason: "x".repeat(100) })), small: [1] };
    const r = limitResult(o, 100 * 1024);
    expect(Buffer.byteLength(r.json, "utf8")).toBeLessThanOrEqual(100 * 1024);
    expect(r.object["truncated"]).toBe(true);
    expect((r.object["packages"] as unknown[]).length).toBeLessThan(2000);
    expect((r.object["packages"] as { name: string }[])[0]?.name).toBe("package-0");
    expect(r.object["small"]).toEqual([1]);
  });
  it("falls back to a minimal object when no list can be cut", () => {
    const r = limitResult({ ok: true, text: "x".repeat(10_000) }, 100);
    expect(r.object).toEqual({ ok: true, truncated: true });
  });
});
