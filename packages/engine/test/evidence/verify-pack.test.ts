// Spec: .kiro/specs/evidence-pack, Requirements 4.1 to 4.6. Properties 31, 32 and 33.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildEvidencePack, serialiseEvidencePack, type EvidenceInput } from "../../src/evidence/build-pack.js";
import { canonicalJson } from "../../src/evidence/canonical-json.js";
import { verifyEvidencePack } from "../../src/evidence/verify-pack.js";
import type { EvidencePack } from "../../src/types.js";
import { arbEvidenceInput, arbHostileInput, arbJsonValue, reorderKeys } from "./arbitraries.js";

async function packOf(i: EvidenceInput): Promise<EvidencePack> {
  const result = await buildEvidencePack(i);
  if (!result.ok) throw new Error(result.reason);
  return result.pack;
}

/** Every path to a leaf (a primitive, an empty array or an empty object). */
function leafPaths(value: unknown, at: (string | number)[] = []): (string | number)[][] {
  if (Array.isArray(value)) return value.length === 0 ? [at] : value.flatMap((v, i) => leafPaths(v, [...at, i]));
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value);
    return keys.length === 0 ? [at] : keys.flatMap((k) => leafPaths((value as Record<string, unknown>)[k], [...at, k]));
  }
  return [at];
}

function getAt(value: unknown, path: readonly (string | number)[]): unknown {
  return path.reduce<unknown>((v, k) => (v as Record<string | number, unknown>)[k], value);
}

function setAt(value: unknown, path: readonly (string | number)[], leaf: unknown): void {
  const parent = getAt(value, path.slice(0, -1)) as Record<string | number, unknown>;
  parent[path[path.length - 1] as string | number] = leaf;
}

const arbPack = fc.oneof(arbEvidenceInput, arbHostileInput);

describe("verifyEvidencePack examples", () => {
  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "pack"],
    ["no evidenceVersion", { body: {}, integrity: {} }],
    ["a string evidenceVersion", { evidenceVersion: "1", body: {}, integrity: {} }],
  ])("returns malformed for %s", async (_label, value) => {
    expect(await verifyEvidencePack(value)).toEqual({ ok: false, reason: "malformed" });
  });

  it("returns unsupported-version for evidenceVersion 2", async () => {
    expect(await verifyEvidencePack({ evidenceVersion: 2 })).toEqual({ ok: false, reason: "unsupported-version" });
  });

  it("returns malformed for a wrong integrity or an unserialisable body", async () => {
    const [sample] = fc.sample(arbEvidenceInput, { numRuns: 1, seed: 7 });
    if (sample === undefined) throw new Error("no sample");
    const pack = await packOf(sample);
    const base = JSON.parse(serialiseEvidencePack(pack)) as Record<string, unknown>;
    const integrity = base["integrity"] as Record<string, unknown>;
    for (const bad of [
      { ...integrity, algorithm: "SHA-1" },
      { ...integrity, canonicalization: "none" },
      { ...integrity, digest: (integrity["digest"] as string).toUpperCase() },
      { ...integrity, extra: 1 },
      "x",
    ]) {
      expect(await verifyEvidencePack({ ...base, integrity: bad })).toEqual({ ok: false, reason: "malformed" });
    }
    expect(await verifyEvidencePack({ ...base, body: [] })).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyEvidencePack({ ...base, body: { ...(base["body"] as object), x: "\ud800" } })).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyEvidencePack(base)).toEqual({ ok: true });
  });

  it("never rejects for arbitrary values", async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (value) => {
        const result = await verifyEvidencePack(value);
        expect(result.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: evidence-pack, Property 33: Built packs verify", () => {
  it("verifies the pack and the parsed pack file", async () => {
    await fc.assert(
      fc.asyncProperty(arbPack, async (i) => {
        const pack = await packOf(i);
        expect(await verifyEvidencePack(pack)).toEqual({ ok: true });
        expect(await verifyEvidencePack(JSON.parse(serialiseEvidencePack(pack)))).toEqual({ ok: true });
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: evidence-pack, Property 31: Key order does not change the digest", () => {
  it("verifies after the body keys are reordered and the file is reprinted", async () => {
    await fc.assert(
      fc.asyncProperty(arbPack, async (i) => {
        const pack = await packOf(i);
        const reordered = { ...pack, body: reorderKeys(pack.body) };
        expect(await verifyEvidencePack(reordered)).toEqual({ ok: true });
        expect(await verifyEvidencePack(JSON.parse(JSON.stringify(reordered, null, 4)))).toEqual({ ok: true });
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: evidence-pack, Property 32: Any leaf edit is caught", () => {
  it("returns digest-mismatch after one leaf of the body changes", async () => {
    await fc.assert(
      fc.asyncProperty(arbPack, fc.nat(), arbJsonValue, async (i, pick, leaf) => {
        const pack = JSON.parse(serialiseEvidencePack(await packOf(i))) as EvidencePack;
        const paths = leafPaths(pack.body);
        const path = paths[pick % paths.length] as (string | number)[];
        fc.pre(canonicalJson(getAt(pack.body, path)) !== canonicalJson(leaf));
        setAt(pack.body, path, leaf);
        expect(await verifyEvidencePack(pack)).toEqual({ ok: false, reason: "digest-mismatch" });
      }),
      { numRuns: 1000 },
    );
  });
});
