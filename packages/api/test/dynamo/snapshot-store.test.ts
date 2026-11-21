// DynamoDB SnapshotStore. Spec: .kiro/specs/infra, Requirements 3.2 to 3.10. Properties 6, 7 and 8.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { ABBREVIATED_ACCEPT, InMemorySnapshotStore, InvalidCaptureTimeError, scorePackages, type Snapshot, type Transport } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { ConditionFailedError, isS, type Item } from "../../src/dynamo/port.js";
import { DynamoSnapshotStore } from "../../src/dynamo/snapshot-store.js";
import { arbSeenSet, arbSnapshot, SEEN_BASE_MS } from "../arbitraries.js";
import { MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } from "../fakes/memory-dynamo.js";
import { captureLogger } from "../support/capture-logger.js";

const NAMES = ["alpha", "@s/beta", "gamma"];
const TIMES = ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000Z", "2026-03-01T12:00:00.5Z", "1999-12-31T23:59:59Z", "2026-02-01T00:00:00Z"];
const DAY_MS = 24 * 60 * 60 * 1000;

function store(port: MemoryDynamo, nextSequence?: () => string) {
  const log = captureLogger();
  return { log, store: new DynamoSnapshotStore(port, SNAPSHOTS_TABLE, SEEN_INDEX, log, nextSequence) };
}

function snapItems(port: MemoryDynamo): readonly Item[] {
  return port.items(SNAPSHOTS_TABLE).filter((item) => isS(item["pk"]) && item["pk"].S.startsWith("snap#"));
}

describe("Feature: infra, Property 6: History order and equivalence with the in-memory store", () => {
  it("history equals what was appended, ordered by capture time then append order, and equals InMemorySnapshotStore", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbSnapshot(NAMES, TIMES), { maxLength: 30 }), fc.array(fc.nat(1000), { minLength: 1, maxLength: 30 }), async (snapshots, keys) => {
        // The port returns query results in a scrambled order, so the store must sort by itself.
        const reorder = (items: Item[]) =>
          items
            .map((item, i) => ({ item, k: keys[i % keys.length] ?? 0, i }))
            .sort((a, b) => a.k - b.k || b.i - a.i)
            .map((entry) => entry.item);
        const { store: dynamo } = store(new MemoryDynamo(undefined, { reorder }));
        const memory = new InMemorySnapshotStore();
        for (const snapshot of snapshots) {
          await dynamo.append(snapshot);
          await memory.append(snapshot);
        }
        for (const name of NAMES) {
          const got = await dynamo.history(name);
          expect(got).toEqual(await memory.history(name));
          const appended = snapshots.filter((s) => s.name === name);
          const expected = appended
            .map((s, i) => ({ s, i, ms: Date.parse(s.captureTime) }))
            .sort((a, b) => a.ms - b.ms || a.i - b.i)
            .map((entry) => entry.s);
          expect(got).toEqual(expected);
        }
      }),
    );
  });
});

describe("Feature: infra, Property 7: Append never replaces", () => {
  it("the snap# item count equals the successful appends and no stored item changes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbSnapshot(NAMES.slice(0, 2), TIMES.slice(0, 2)), { minLength: 1, maxLength: 15 }),
        fc.array(fc.constantFrom("s1", "s2", "s3"), { minLength: 1, maxLength: 8 }),
        async (snapshots, pool) => {
          let i = 0;
          const nextSequence = () => pool[i++ % pool.length] ?? "s1";
          const port = new MemoryDynamo();
          const { store: dynamo } = store(port, nextSequence);
          let successes = 0;
          for (const snapshot of snapshots) {
            try {
              await dynamo.append(snapshot);
              successes += 1;
            } catch (error) {
              expect(error).toBeInstanceOf(ConditionFailedError);
            }
          }
          expect(snapItems(port)).toHaveLength(successes);
          const snapWrites = port.writes.filter((w) => isS(w.item["pk"]) && w.item["pk"].S.startsWith("snap#"));
          expect(snapWrites).toHaveLength(successes);
          const current = new Map(snapItems(port).map((item) => [JSON.stringify([item["pk"], item["sk"]]), item]));
          for (const write of snapWrites) expect(current.get(JSON.stringify([write.item["pk"], write.item["sk"]]))).toEqual(write.item);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: infra, Property 8: Seen listing", () => {
  const arbCase = arbSeenSet.chain((records) => {
    const free = fc.tuple(fc.integer({ min: -250 * DAY_MS, max: 250 * DAY_MS }).map((o) => SEEN_BASE_MS + o), fc.integer({ min: 0, max: 300 * DAY_MS }));
    if (records.length === 0) return fc.tuple(fc.constant(records), free);
    const at = (i: number) => records[i % records.length]?.at ?? SEEN_BASE_MS;
    const boundary = fc
      .tuple(fc.nat(), fc.nat(), fc.constantFrom(-1, 0, 1), fc.constantFrom(-1, 0, 1))
      .map(([i, j, d1, d2]): [number, number] => {
        const ref = at(i) + d1;
        return [ref, Math.max(0, ref - at(j) + d2)];
      });
    return fc.tuple(fc.constant(records), fc.oneof(free, boundary));
  });

  it("returns exactly the names seen in [reference - window, reference], once each, in code-unit order", async () => {
    await fc.assert(
      fc.asyncProperty(arbCase, async ([records, [ref, windowMs]]) => {
        const { store: dynamo } = store(new MemoryDynamo());
        const memory = new InMemorySnapshotStore();
        for (const record of records) {
          await dynamo.recordSeen(record.name, new Date(record.at));
          await memory.recordSeen(record.name, new Date(record.at));
        }
        const got = await dynamo.listSeenWithin(new Date(ref), windowMs);
        const expected = [...new Set(records.filter((r) => r.at <= ref && ref - r.at <= windowMs).map((r) => r.name))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        expect(got).toEqual(expected);
        expect(got).toEqual(await memory.listSeenWithin(new Date(ref), windowMs));
      }),
      { numRuns: 1000 },
    );
  });
});

describe("DynamoSnapshotStore examples", () => {
  const snapshot: Snapshot = { name: "alpha", captureTime: "2026-01-01T00:00:00Z", maintainers: ["alice"], versions: [] };

  it("rejects a capture time that is not ISO 8601 UTC with InvalidCaptureTimeError and writes nothing", async () => {
    const port = new MemoryDynamo();
    const { store: dynamo } = store(port);
    for (const captureTime of ["2026-01-01", "2026-01-01T00:00:00+01:00", "not a date", "2026-13-01T00:00:00Z"]) {
      await expect(dynamo.append({ ...snapshot, captureTime })).rejects.toBeInstanceOf(InvalidCaptureTimeError);
    }
    expect(port.writes).toHaveLength(0);
  });

  it("retries once with a new sequence on a collision, and rejects on a second collision", async () => {
    const port = new MemoryDynamo();
    const sequences = ["x", "x", "y", "x", "y"];
    const { store: dynamo, log } = store(port, () => sequences.shift() ?? "z");
    await dynamo.append(snapshot); // x
    await dynamo.append(snapshot); // x collides, retries with y
    expect(snapItems(port)).toHaveLength(2);
    await expect(dynamo.append(snapshot)).rejects.toBeInstanceOf(ConditionFailedError); // x, then y: both collide
    expect(snapItems(port)).toHaveLength(2);
    expect(log.lines.filter((l) => l.fields["msg"] === "snapshot-key-collision")).toHaveLength(2);
  });

  it("rejects other put errors without a retry", async () => {
    let puts = 0;
    const port = new MemoryDynamo(undefined, { fail: (op) => (op === "putItem" ? ((puts += 1), new Error("down")) : undefined) });
    await expect(store(port).store.append(snapshot)).rejects.toThrow("down");
    expect(puts).toBe(1);
  });

  it("drops corrupt history items, logs a count without the name, and keeps the rest", async () => {
    const port = new MemoryDynamo();
    const { store: dynamo, log } = store(port);
    await dynamo.append(snapshot);
    await port.putItem(SNAPSHOTS_TABLE, { pk: { S: "snap#alpha" }, sk: { S: "bad-key" }, data: { S: JSON.stringify(snapshot) } });
    await port.putItem(SNAPSHOTS_TABLE, { pk: { S: "snap#alpha" }, sk: { S: "000000000000001#a" }, data: { S: "{not json" } });
    await port.putItem(SNAPSHOTS_TABLE, { pk: { S: "snap#alpha" }, sk: { S: "000000000000002#a" }, data: { S: JSON.stringify({ ...snapshot, name: "beta" }) } });
    await port.putItem(SNAPSHOTS_TABLE, { pk: { S: "snap#alpha" }, sk: { S: "000000000000003#a" }, data: { S: JSON.stringify({ name: "alpha" }) } });
    expect(await dynamo.history("alpha")).toEqual([snapshot]);
    expect(log.lines).toEqual([{ level: "warn", fields: { msg: "snapshot-corrupt", count: 4 } }]);
  });

  it("writes Seen records with gpk and a Number seenAt, and Snapshots without them", async () => {
    const port = new MemoryDynamo();
    const { store: dynamo } = store(port, () => "q");
    await dynamo.recordSeen("@s/beta", new Date(1000));
    await dynamo.append(snapshot);
    const [seen, snap] = port.writes.map((w) => w.item);
    expect(seen).toEqual({ pk: { S: "seen#@s/beta" }, sk: { S: `${String(1000 + 62_167_219_200_000).padStart(15, "0")}#q` }, gpk: { S: "seen" }, seenAt: { N: "1000" }, name: { S: "@s/beta" } });
    expect(Object.keys(snap ?? {}).sort()).toEqual(["data", "pk", "sk"]);
  });

  it("lists nothing for a negative or NaN window or reference, and everything up to the reference for an infinite window", async () => {
    const { store: dynamo } = store(new MemoryDynamo());
    await dynamo.recordSeen("old", new Date(0));
    await dynamo.recordSeen("future", new Date(SEEN_BASE_MS + DAY_MS));
    const ref = new Date(SEEN_BASE_MS);
    expect(await dynamo.listSeenWithin(ref, -1)).toEqual([]);
    expect(await dynamo.listSeenWithin(ref, Number.NaN)).toEqual([]);
    expect(await dynamo.listSeenWithin(new Date(Number.NaN), 10)).toEqual([]);
    expect(await dynamo.listSeenWithin(ref, Number.POSITIVE_INFINITY)).toEqual(["old"]);
  });

  it("sends plain integer bounds for a huge finite window, and lists like the in-memory store", async () => {
    const port = new MemoryDynamo();
    const { store: dynamo } = store(port);
    const memory = new InMemorySnapshotStore();
    for (const s of [dynamo, memory]) await s.recordSeen("old", new Date("0001-06-01T00:00:00Z"));
    const sent: string[] = [];
    const spy = { ...port, getItem: port.getItem.bind(port), putItem: port.putItem.bind(port), query: (input: Parameters<MemoryDynamo["query"]>[0]) => {
      if (input.sortBetween !== undefined) for (const bound of [input.sortBetween.low, input.sortBetween.high]) if ("N" in bound) sent.push(bound.N);
      return port.query(input);
    } };
    const spied = new DynamoSnapshotStore(spy, SNAPSHOTS_TABLE, SEEN_INDEX, captureLogger());
    for (const windowMs of [1e200, Number.MAX_VALUE, Number.POSITIVE_INFINITY]) {
      expect(await spied.listSeenWithin(new Date(SEEN_BASE_MS), windowMs)).toEqual(await memory.listSeenWithin(new Date(SEEN_BASE_MS), windowMs));
    }
    expect(await dynamo.listSeenWithin(new Date(SEEN_BASE_MS), 1e200)).toEqual(["old"]);
    expect(sent).toHaveLength(6);
    for (const n of sent) expect(n).toMatch(/^-?\d+$/);
  });

  it("rejects listSeenWithin when the query fails, so runSnapshotter reports the listing error", async () => {
    const port = new MemoryDynamo(undefined, { fail: (op) => (op === "query" ? new Error("down") : undefined) });
    const { store: dynamo, log } = store(port);
    await expect(dynamo.listSeenWithin(new Date(SEEN_BASE_MS), DAY_MS)).rejects.toThrow("down");
    expect(log.lines[0]?.fields).toEqual({ msg: "seen-list-failed", errorName: "Error" });
  });
});

describe("the engine's seeded maintainer change scored over this store", () => {
  const SEED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "engine", "test", "fixtures", "seed-maintainer-change.json");
  const NOW = new Date("2026-11-12T00:00:00Z");
  const VERSION = "1.2.1";

  function transportFor(name: string, maintainers: readonly string[]): Transport {
    const routes: { url: string; accept?: string; body?: string; json: unknown }[] = [
      {
        url: `https://registry.npmjs.org/${name}`,
        accept: "application/json",
        json: { time: { "1.2.0": "2026-09-01T10:00:00.000Z", "1.2.1": "2026-09-20T10:00:00.000Z" }, versions: { "1.2.0": {}, "1.2.1": {} }, maintainers: maintainers.map((n) => ({ name: n })) },
      },
      { url: `https://registry.npmjs.org/${name}`, accept: ABBREVIATED_ACCEPT, json: { versions: { "1.2.0": {}, "1.2.1": {} } } },
      { url: "https://api.osv.dev/v1/querybatch", body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version: VERSION }] }), json: { results: [{}] } },
      { url: `https://api.deps.dev/v3/systems/npm/packages/${name}/versions/${VERSION}:dependencies`, json: { nodes: [{ versionKey: { system: "NPM", name, version: VERSION } }], edges: [] } },
      { url: `https://registry.npmjs.org/-/npm/v1/attestations/${name}@${VERSION}`, json: { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] } },
    ];
    return (url, request) => {
      const route = routes.find((r) => r.url === url && (r.accept === undefined || r.accept === request.headers["Accept"]) && (r.body === undefined || r.body === request.body));
      return Promise.resolve(route === undefined ? { status: 404, json: () => Promise.resolve({}) } : { status: 200, json: () => Promise.resolve(structuredClone(route.json)) });
    };
  }

  it("gives the same Possessed result as InMemorySnapshotStore", async () => {
    const seed = JSON.parse(readFileSync(SEED, "utf8")) as { name: string; snapshots: Snapshot[] };
    const last = seed.snapshots.at(-1);
    if (last === undefined) throw new Error("seed has no snapshots");
    const { store: dynamo } = store(new MemoryDynamo());
    const memory = new InMemorySnapshotStore();
    for (const snapshot of seed.snapshots) {
      await dynamo.append(snapshot);
      await memory.append(snapshot);
    }
    const score = (snapshotStore: DynamoSnapshotStore | InMemorySnapshotStore) =>
      scorePackages([{ name: seed.name, installedVersion: VERSION }], {
        transport: transportFor(seed.name, last.maintainers),
        clock: () => NOW,
        retry: { sleep: () => Promise.resolve() },
        snapshotStore,
      });
    const viaDynamo = await score(dynamo);
    expect(viaDynamo).toEqual(await score(memory));
    expect(viaDynamo.packages[0]?.state).toBe("Possessed");
    expect(viaDynamo.packages[0]?.stateReason).toBe("maintainer change in the last 90 days");
    expect(await dynamo.listSeenWithin(NOW, DAY_MS)).toEqual([seed.name]);
  });
});
