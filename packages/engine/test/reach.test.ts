// Example tests for the pure transitive reach rules. Requirements 3.3, 3.4, 3.7.
// Properties 6, 7 and 8 (task 3.3) follow the examples.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { transitiveReach, unionGraph, type NameEdge, type ResolvedGraph } from "../src/reach.js";

function graph(names: readonly string[], edges: readonly NameEdge[]): ResolvedGraph {
  return { names, edges };
}

describe("unionGraph", () => {
  it("gives empty nodes and no dependents for an empty list", () => {
    const union = unionGraph([]);
    expect(union.nodes.size).toBe(0);
    expect(union.dependentsOf.size).toBe(0);
  });

  it("drops self edges but keeps the node", () => {
    const union = unionGraph([graph(["A"], [["A", "A"]])]);
    expect(union.nodes.has("A")).toBe(true);
    expect(union.dependentsOf.size).toBe(0);
  });
});

describe("transitiveReach", () => {
  it("counts a diamond dependent once", () => {
    const union = unionGraph([
      graph(["A", "B", "C", "D"], [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]]),
    ]);
    expect(transitiveReach(union, "D")).toBe(3);
  });

  it("terminates on a cycle and never counts the name itself", () => {
    const union = unionGraph([graph(["A", "B", "C"], [["A", "B"], ["B", "C"], ["C", "A"]])]);
    expect(transitiveReach(union, "A")).toBe(2);
    expect(transitiveReach(union, "B")).toBe(2);
    expect(transitiveReach(union, "C")).toBe(2);
  });

  it("ignores duplicate edges and self edges", () => {
    const union = unionGraph([
      graph(["A", "B"], [["A", "B"], ["A", "B"], ["B", "B"], ["A", "A"]]),
    ]);
    expect(transitiveReach(union, "B")).toBe(1);
    expect(transitiveReach(union, "A")).toBe(0);
  });

  it("gives 0 for a name absent from the union", () => {
    const union = unionGraph([graph(["A", "B"], [["A", "B"]])]);
    expect(transitiveReach(union, "Z")).toBe(0);
    expect(transitiveReach(unionGraph([]), "Z")).toBe(0);
  });

  it("counts direct and transitive dependents", () => {
    const union = unionGraph([graph(["A", "B", "C"], [["A", "B"], ["B", "C"]])]);
    expect(transitiveReach(union, "C")).toBe(2);
    expect(transitiveReach(union, "B")).toBe(1);
    expect(transitiveReach(union, "A")).toBe(0);
  });

  it("counts a name once across several graphs and versions of the same name", () => {
    // Graphs for two versions of X, both listing the same dependent Y, plus a second path via Z.
    const union = unionGraph([
      graph(["Y", "X"], [["Y", "X"]]),
      graph(["Y", "X"], [["Y", "X"]]),
      graph(["Y", "Z", "X"], [["Y", "Z"], ["Z", "X"]]),
    ]);
    expect(transitiveReach(union, "X")).toBe(2);
  });

  it("gives the same result when graphs are merged in a different order", () => {
    const g1 = graph(["A", "B"], [["A", "B"]]);
    const g2 = graph(["B", "C"], [["B", "C"]]);
    const g3 = graph(["D", "C"], [["D", "C"]]);
    const forward = unionGraph([g1, g2, g3]);
    const backward = unionGraph([g3, g2, g1]);
    for (const name of ["A", "B", "C", "D", "Z"]) {
      expect(transitiveReach(backward, name)).toBe(transitiveReach(forward, name));
    }
    expect(transitiveReach(forward, "C")).toBe(3);
  });
});

// Properties 6, 7 and 8. Requirements 3.4, 3.5, 3.9.
const ALPHABET = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
const nameArb = fc.constantFrom(...ALPHABET);
const edgeArb: fc.Arbitrary<NameEdge> = fc.tuple(nameArb, nameArb);
const graphArb: fc.Arbitrary<ResolvedGraph> = fc.record({
  names: fc.array(nameArb, { maxLength: 10 }),
  edges: fc.array(edgeArb, { maxLength: 20 }),
});
const graphsArb = fc.array(graphArb, { maxLength: 6 });
// Probe names include one that is never in the alphabet.
const probeNames: readonly string[] = [...ALPHABET, "absent"];
const keysArb = fc.array(fc.integer(), { minLength: 1, maxLength: 8 });

function permute<T>(items: readonly T[], keys: readonly number[]): T[] {
  return items
    .map((item, i) => ({ item, key: keys[i % keys.length] ?? 0, i }))
    .sort((x, y) => x.key - y.key || x.i - y.i)
    .map((x) => x.item);
}

/** Independent oracle: fixpoint over the raw edge list. */
function oracleReach(graphs: readonly ResolvedGraph[], name: string): number {
  const edges = graphs.flatMap((g) => g.edges).filter(([a, b]) => a !== b);
  const found = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [dependent, dependency] of edges) {
      if (
        (dependency === name || found.has(dependency)) &&
        dependent !== name &&
        !found.has(dependent)
      ) {
        found.add(dependent);
        changed = true;
      }
    }
  }
  return found.size;
}

describe("reach properties", () => {
  it("Feature: history-signals, Property 6: Transitive reach bounds and order independence", () => {
    fc.assert(
      fc.property(graphsArb, keysArb, (graphs, keys) => {
        const union = unionGraph(graphs);
        const shuffled = unionGraph(
          permute(graphs, keys).map((g) => ({
            names: permute(g.names, keys),
            edges: permute(g.edges, keys),
          })),
        );
        for (const name of probeNames) {
          const reach = transitiveReach(union, name);
          const max = union.nodes.has(name) ? union.nodes.size - 1 : union.nodes.size;
          expect(Number.isInteger(reach)).toBe(true);
          expect(reach).toBeGreaterThanOrEqual(0);
          expect(reach).toBeLessThanOrEqual(max);
          expect(reach).toBe(oracleReach(graphs, name));
          expect(transitiveReach(shuffled, name)).toBe(reach);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: history-signals, Property 7: Chain reach is n minus 1", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 30 }),
        fc.array(fc.nat(), { maxLength: 10 }),
        (names, cuts) => {
          const edges: NameEdge[] = names.slice(1).map((n, i) => [names[i] as string, n]);
          // Split the edge list into several graphs at arbitrary cut points.
          const points = [...new Set(cuts.map((c) => c % (edges.length + 1)))].sort(
            (x, y) => x - y,
          );
          const graphs: ResolvedGraph[] = [];
          let start = 0;
          for (const point of [...points, edges.length]) {
            graphs.push({ names: [], edges: edges.slice(start, point) });
            start = point;
          }
          const union = unionGraph(graphs);
          const first = names[0] as string;
          const last = names[names.length - 1] as string;
          expect(transitiveReach(union, last)).toBe(names.length - 1);
          expect(transitiveReach(union, first)).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Feature: history-signals, Property 8: Merge idempotence", () => {
    fc.assert(
      fc.property(graphsArb, (graphs) => {
        const once = unionGraph(graphs);
        const twice = unionGraph([...graphs, ...graphs]);
        expect(twice.nodes).toEqual(once.nodes);
        expect(twice.dependentsOf).toEqual(once.dependentsOf);
        for (const name of probeNames) {
          expect(transitiveReach(twice, name)).toBe(transitiveReach(once, name));
        }
      }),
      { numRuns: 100 },
    );
  });
});
