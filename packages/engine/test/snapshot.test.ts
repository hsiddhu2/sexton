// SnapshotStore example tests. Requirements 4.6 to 4.13. Property 4 is at the end of this file.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InMemorySnapshotStore,
  InvalidCaptureTimeError,
  RECENT_WINDOW_MS,
  type Snapshot,
} from "../src/snapshot.js";
import { arbSnapshot } from "./arbitraries.js";

function snap(name: string, captureTime: string, maintainers: readonly string[] = ["alice"]): Snapshot {
  return {
    name,
    captureTime,
    maintainers,
    versions: [{ version: "1.0.0", publishTime: "2026-01-01T00:00:00.000Z", hasInstallScript: false, provenance: true }],
  };
}

const REFERENCE = new Date("2026-11-05T00:00:00.000Z");

describe("InMemorySnapshotStore history", () => {
  it("orders by numeric capture time, not by string or append order (4.7)", async () => {
    const store = new InMemorySnapshotStore();
    // Appended out of order; the numeric order must be restored.
    await store.append(snap("a", "2026-03-01T00:00:00.000Z", ["c"]));
    await store.append(snap("a", "2026-01-01T00:00:00Z", ["a"]));
    await store.append(snap("a", "2026-02-01T00:00:00.500Z", ["b"]));
    const history = await store.history("a");
    expect(history.map((s) => s.maintainers[0])).toEqual(["a", "b", "c"]);
  });

  it("compares instants numerically when the string forms differ in precision (4.7)", async () => {
    const store = new InMemorySnapshotStore();
    await store.append(snap("a", "2026-01-01T00:00:00.5Z", ["later"]));
    await store.append(snap("a", "2026-01-01T00:00:00Z", ["earlier"]));
    const history = await store.history("a");
    expect(history.map((s) => s.maintainers[0])).toEqual(["earlier", "later"]);
  });

  it("orders equal capture times by append order (4.7)", async () => {
    const store = new InMemorySnapshotStore();
    await store.append(snap("a", "2026-01-01T00:00:00.000Z", ["first"]));
    await store.append(snap("a", "2026-01-01T00:00:00Z", ["second"]));
    await store.append(snap("a", "2026-01-01T00:00:00.000Z", ["third"]));
    const history = await store.history("a");
    expect(history.map((s) => s.maintainers[0])).toEqual(["first", "second", "third"]);
  });

  it("returns a snapshot deeply equal to the one appended, including null provenance (4.4, 4.13)", async () => {
    const store = new InMemorySnapshotStore();
    const input: Snapshot = {
      name: "a",
      captureTime: "2026-01-01T00:00:00.000Z",
      maintainers: ["alice", "bob"],
      versions: [
        { version: "1.0.0", publishTime: "2025-12-01T00:00:00.000Z", hasInstallScript: false, provenance: null },
        { version: "1.1.0", publishTime: "2025-12-15T00:00:00.000Z", hasInstallScript: true, provenance: false },
        { version: "1.2.0", publishTime: "2025-12-20T00:00:00.000Z", hasInstallScript: false, provenance: true },
      ],
    };
    await store.append(input);
    const [read] = await store.history("a");
    expect(read).toEqual(input);
    expect(read?.versions[0]?.provenance).toBeNull();
    expect(read?.versions[1]?.provenance).toBe(false);
  });

  it("keeps the History of other packages unchanged when one package is appended (4.8)", async () => {
    const store = new InMemorySnapshotStore();
    await store.append(snap("a", "2026-01-01T00:00:00.000Z"));
    await store.append(snap("b", "2026-01-02T00:00:00.000Z"));
    const beforeB = await store.history("b");
    await store.append(snap("a", "2026-01-03T00:00:00.000Z"));
    expect(await store.history("b")).toEqual(beforeB);
    expect(await store.history("a")).toHaveLength(2);
    expect(await store.history("b")).toHaveLength(1);
  });

  it("returns an empty History for an unknown package without raising (4.11)", async () => {
    const store = new InMemorySnapshotStore();
    await expect(store.history("nobody")).resolves.toEqual([]);
    await store.append(snap("a", "2026-01-01T00:00:00.000Z"));
    await expect(store.history("nobody")).resolves.toEqual([]);
  });

  it("is unaffected by mutating a returned History (4.6)", async () => {
    const store = new InMemorySnapshotStore();
    await store.append(snap("a", "2026-01-01T00:00:00.000Z", ["alice"]));
    const first = (await store.history("a")) as Snapshot[];
    const expected = structuredClone(first);

    const mutable = first[0] as { name: string; captureTime: string; maintainers: string[]; versions: { provenance: boolean | null }[] };
    mutable.maintainers.push("mallory");
    mutable.name = "evil";
    mutable.captureTime = "1999-01-01T00:00:00.000Z";
    const version = mutable.versions[0];
    if (version !== undefined) version.provenance = null;
    first.push(snap("a", "2030-01-01T00:00:00.000Z"));
    first.length = 0;

    expect(await store.history("a")).toEqual(expected);
  });

  it("is unaffected by mutating the snapshot after it was appended (4.6)", async () => {
    const store = new InMemorySnapshotStore();
    const input = { ...snap("a", "2026-01-01T00:00:00.000Z", ["alice"]), maintainers: ["alice"] };
    await store.append(input);
    input.maintainers.push("mallory");
    const [read] = await store.history("a");
    expect(read?.maintainers).toEqual(["alice"]);
  });
});

describe("InMemorySnapshotStore invalid capture time (4.12)", () => {
  const invalid = [
    "not a date",
    "",
    "2026-01-01",
    "2026-01-01T00:00:00",
    "2026-01-01T00:00:00+00:00",
    "2026-01-01 00:00:00Z",
    "2026-13-45T99:99:99Z",
  ];

  it.each(invalid)("rejects %j with InvalidCaptureTimeError and changes nothing", async (captureTime) => {
    const store = new InMemorySnapshotStore();
    await store.append(snap("a", "2026-01-01T00:00:00.000Z"));
    const before = await store.history("a");

    await expect(store.append(snap("a", captureTime))).rejects.toBeInstanceOf(InvalidCaptureTimeError);
    await expect(store.append(snap("new", captureTime))).rejects.toBeInstanceOf(InvalidCaptureTimeError);

    expect(await store.history("a")).toEqual(before);
    expect(await store.history("new")).toEqual([]);
  });

  it("rejects a non-string capture time", async () => {
    const store = new InMemorySnapshotStore();
    const bad = { ...snap("a", "2026-01-01T00:00:00.000Z"), captureTime: 12345 } as unknown as Snapshot;
    await expect(store.append(bad)).rejects.toBeInstanceOf(InvalidCaptureTimeError);
    expect(await store.history("a")).toEqual([]);
  });
});

describe("InMemorySnapshotStore seen window (4.9, 4.10)", () => {
  const at = (offsetMs: number): Date => new Date(REFERENCE.getTime() + offsetMs);

  it("includes a record exactly 90 days before the reference (inclusive)", async () => {
    const store = new InMemorySnapshotStore();
    await store.recordSeen("edge", at(-RECENT_WINDOW_MS));
    await expect(store.listSeenWithin(REFERENCE, RECENT_WINDOW_MS)).resolves.toEqual(["edge"]);
  });

  it("excludes a record one millisecond older than 90 days", async () => {
    const store = new InMemorySnapshotStore();
    await store.recordSeen("old", at(-RECENT_WINDOW_MS - 1));
    await expect(store.listSeenWithin(REFERENCE, RECENT_WINDOW_MS)).resolves.toEqual([]);
  });

  it("includes a record exactly at the reference and excludes one after it", async () => {
    const store = new InMemorySnapshotStore();
    await store.recordSeen("now", REFERENCE);
    await store.recordSeen("future", at(1));
    await expect(store.listSeenWithin(REFERENCE, RECENT_WINDOW_MS)).resolves.toEqual(["now"]);
  });

  it("includes a package when any Seen record is Recent, even if another is old or later", async () => {
    const store = new InMemorySnapshotStore();
    await store.recordSeen("mixed", at(-RECENT_WINDOW_MS - 1000));
    await store.recordSeen("mixed", at(-1000));
    await store.recordSeen("future-too", at(-1000));
    await store.recordSeen("future-too", at(5000));
    await expect(store.listSeenWithin(REFERENCE, RECENT_WINDOW_MS)).resolves.toEqual(["future-too", "mixed"]);
  });

  it("returns each name once in ascending lexical order", async () => {
    const store = new InMemorySnapshotStore();
    for (const name of ["zeta", "alpha", "Beta", "alpha", "@scope/pkg", "zeta"]) {
      await store.recordSeen(name, at(-1000));
      await store.recordSeen(name, at(-2000));
    }
    await expect(store.listSeenWithin(REFERENCE, RECENT_WINDOW_MS)).resolves.toEqual([
      "@scope/pkg",
      "Beta",
      "alpha",
      "zeta",
    ]);
  });

  it("returns an empty list when nothing was seen", async () => {
    const store = new InMemorySnapshotStore();
    await expect(store.listSeenWithin(REFERENCE, RECENT_WINDOW_MS)).resolves.toEqual([]);
  });
});

/** Every element of `sub` appears in `full`, deeply equal, in the same relative order. */
function isOrderedSubsequence(sub: readonly Snapshot[], full: readonly Snapshot[]): boolean {
  let i = 0;
  for (const item of full) {
    if (i < sub.length && JSON.stringify(item) === JSON.stringify(sub[i])) i++;
  }
  return i === sub.length;
}

/** Destructively mutates a returned History in every way the types allow after a cast. */
function mutateHistory(history: readonly Snapshot[]): void {
  const list = history as Snapshot[];
  for (const entry of list) {
    const m = entry as unknown as {
      name: string;
      captureTime: string;
      maintainers: string[];
      versions: { version: string; provenance: boolean | null; hasInstallScript: boolean }[];
    };
    m.maintainers.push("evil");
    m.maintainers.length = 0;
    m.name = "evil";
    m.captureTime = "1999-01-01T00:00:00.000Z";
    for (const v of m.versions) {
      v.version = "9.9.9";
      v.provenance = null;
      v.hasInstallScript = !v.hasInstallScript;
    }
    m.versions.length = 0;
  }
  list.reverse();
  list.length = 0;
}

describe("Property 4", () => {
  it("Feature: history-signals, Property 4: Append-only store round trip and immutability", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbSnapshot, { maxLength: 30 }), async (snapshots) => {
        const store = new InMemorySnapshotStore();
        const model = new Map<string, { snapshot: Snapshot; ms: number }[]>();
        const names = ["a", "b", "c", "@s/d"];

        for (const input of snapshots) {
          const before = new Map<string, readonly Snapshot[]>();
          for (const n of names) before.set(n, await store.history(n));

          const original = structuredClone(input);
          await store.append(input);
          const entries = model.get(input.name) ?? [];
          entries.push({ snapshot: original, ms: Date.parse(original.captureTime) });
          // Array.prototype.sort is stable: ties keep append order.
          entries.sort((x, y) => x.ms - y.ms);
          model.set(input.name, entries);

          for (const n of names) {
            const after = await store.history(n);
            // 4.4, 4.7: round trip, ordered by numeric capture time then append order.
            expect(after).toEqual((model.get(n) ?? []).map((e) => e.snapshot));
            const prior = before.get(n) ?? [];
            if (n === input.name) {
              // 4.5: earlier snapshots survive, in order, with the new one added.
              expect(after).toHaveLength(prior.length + 1);
              expect(isOrderedSubsequence(prior, after)).toBe(true);
            } else {
              // 4.8: other packages unchanged.
              expect(after).toEqual(prior);
            }
          }
        }

        // 4.6: mutating returned values never changes a later read.
        for (const n of names) {
          const returned = await store.history(n);
          const frozen = structuredClone(returned);
          mutateHistory(returned);
          expect(await store.history(n)).toEqual(frozen);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
