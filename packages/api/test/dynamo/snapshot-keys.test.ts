// Snapshot key encoding. Spec: .kiro/specs/infra, Requirements 3.2, 3.3. Property 5.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CAPTURE_OFFSET_MS, decodeSnapshotSk, encodeSeenSk, encodeSnapshotSk, seenPk, snapshotPk } from "../../src/dynamo/snapshot-keys.js";
import { arbIsoUtc, arbPackageName, arbSequence } from "../arbitraries.js";

const arbTriple = fc.tuple(arbPackageName, arbIsoUtc.map((iso) => Date.parse(iso)), arbSequence);

function encode([name, ms, seq]: readonly [string, number, string]): string {
  return JSON.stringify([snapshotPk(name), encodeSnapshotSk(ms, seq)]);
}

describe("Feature: infra, Property 5: Snapshot key encoding is injective and round-trips", () => {
  it("decode(encode(t, s)) gives back t and s", () => {
    fc.assert(fc.property(arbTriple, ([, ms, seq]) => {
      expect(decodeSnapshotSk(encodeSnapshotSk(ms, seq))).toEqual({ captureMs: ms, sequence: seq });
    }));
  });

  it("distinct triples give distinct keys, including equal names and times and sequences with '#'", () => {
    const arbPair = fc.oneof(
      fc.tuple(arbTriple, arbTriple),
      fc.tuple(arbTriple, arbSequence).map(([t, other]) => [t, [t[0], t[1], other]] as const),
      fc.tuple(arbTriple, fc.string({ maxLength: 5 })).map(([t, x]) => [[t[0], t[1], `${x}#a`], [t[0], t[1], `${x}#b`]] as const),
    );
    fc.assert(fc.property(arbPair, ([a, b]) => {
      const same = a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
      expect(encode(a) === encode(b)).toBe(same);
    }));
  });

  it("orders sort keys by numeric capture time", () => {
    fc.assert(fc.property(arbTriple, arbTriple, ([, t1, s1], [, t2, s2]) => {
      fc.pre(t1 !== t2);
      const k1 = encodeSnapshotSk(t1, s1);
      const k2 = encodeSnapshotSk(t2, s2);
      expect(k1 < k2).toBe(t1 < t2);
    }));
  });
});

describe("snapshot keys", () => {
  it("encodes the epoch and the year-0000 boundary as 15 digits", () => {
    expect(encodeSnapshotSk(0, "s")).toBe(`0${String(CAPTURE_OFFSET_MS)}#s`);
    expect(encodeSnapshotSk(Date.parse("0000-01-01T00:00:00.000Z"), "s")).toBe("000000000000000#s");
    expect(encodeSeenSk(Date.parse("9999-12-31T23:59:59.999Z"), "x")).toBe("315569519999999#x");
  });

  it("rejects a time it cannot encode", () => {
    expect(() => encodeSnapshotSk(-CAPTURE_OFFSET_MS - 1, "s")).toThrow(RangeError);
    expect(() => encodeSnapshotSk(Number.NaN, "s")).toThrow(RangeError);
    expect(() => encodeSnapshotSk(1.5, "s")).toThrow(RangeError);
  });

  it("decodes only the fixed shape", () => {
    for (const bad of ["", "123", "000000000000000", "00000000000000x#s", "000000000000000s", "-00000000000000#s"]) {
      expect(decodeSnapshotSk(bad)).toBeUndefined();
    }
    expect(decodeSnapshotSk("000000000000000#")).toEqual({ captureMs: -CAPTURE_OFFSET_MS, sequence: "" });
  });

  it("uses the fixed prefixes", () => {
    expect(snapshotPk("@a/b")).toBe("snap#@a/b");
    expect(seenPk("@a/b")).toBe("seen#@a/b");
  });
});
