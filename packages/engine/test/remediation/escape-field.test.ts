// Spec: .kiro/specs/remediation, Requirements 5.6, 5.17, 8.8, property 11.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cleanLine } from "../../src/remediation/clean-line.js";
import { escapeField } from "../../src/remediation/escape-field.js";

const SPECIALS = ["`", "|", "\n", "\r", "\u2028", "\u2029", "\u202a", "\u202e", "\u2066", "\u2069", "\u200e", "\u200f", "\u061c", "\u0085", "\u0000", "\u007f", "\ud800", "\udc00", "\ud83d\ude00", "a", " "];
const BAD = /[\n\r\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/;
const codePoints = (s: string): number => Array.from(s).length;

const arbSpecial = fc.array(fc.constantFrom(...SPECIALS), { maxLength: 400 }).map((a) => a.join(""));
const arbBoundary = fc.tuple(fc.constantFrom(199, 200, 201), fc.constantFrom("|", "\ud83d\ude00", "x")).map(([n, c]) => c.repeat(n));

function checkInvariants(input: string): void {
  const out = escapeField(input);
  expect(codePoints(out)).toBeLessThanOrEqual(203);
  expect(out.startsWith("`") && out.endsWith("`")).toBe(true);
  const inner = out.slice(1, -1);
  expect(inner.includes("`")).toBe(false);
  expect(BAD.test(inner)).toBe(false);
  for (let i = 0; i < inner.length; i++) if (inner[i] === "|") expect(inner[i - 1]).toBe("\\");
  expect(escapeField(input)).toBe(out);
}

describe("escapeField", () => {
  it("Feature: remediation, Property 11: escapeField invariants", () => {
    fc.assert(
      fc.property(fc.oneof(fc.fullUnicodeString({ maxLength: 600 }), arbSpecial, arbBoundary, fc.string({ maxLength: 600 })), (input) => {
        checkInvariants(input);
        const plain = !/[`|\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c\ud800-\udfff]/u.test(input) && input.length > 0;
        if (plain && codePoints(input) <= 200) expect(escapeField(input)).toBe(`\`${input}\``);
        if (codePoints(input) > 200) {
          const inner = escapeField(input).slice(1, -1);
          expect(inner.endsWith("\u2026")).toBe(true);
          expect(inner.slice(0, -1).endsWith("\\") && !inner.slice(0, -1).endsWith("\\|")).toBe(false);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("examples", () => {
    expect(escapeField("")).toBe("` `");
    expect(escapeField("a`b")).toBe("`a'b`");
    expect(escapeField("a|b")).toBe("`a\\|b`");
    expect(escapeField("a\nb")).toBe("`a b`");
    expect(escapeField("\u202eabc")).toBe("` abc`");
    // Correction from spec migration-node-sass, Requirement 9.1: direction marks.
    expect(escapeField("a\u200eb\u200fc\u061cd")).toBe("`a b c d`");
    expect(escapeField("x".repeat(200))).toBe(`\`${"x".repeat(200)}\``);
    expect(escapeField("x".repeat(201))).toBe(`\`${"x".repeat(200)}\u2026\``);
    expect(escapeField("|".repeat(101))).toBe(`\`${"\\|".repeat(100)}\u2026\``);
  });

  it("cleanLine removes line breaks and caps code points", () => {
    expect(cleanLine("a\nb", 10)).toBe("a b");
    expect(cleanLine("abcdef", 3)).toBe("abc\u2026");
  });
});
