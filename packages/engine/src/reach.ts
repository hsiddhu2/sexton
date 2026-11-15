/**
 * Transitive reach over the union of resolved dependency graphs.
 * Pure: no I/O, no clock.
 */

/** An edge by package name: [dependent, dependency]. */
export type NameEdge = readonly [dependent: string, dependency: string];

export interface ResolvedGraph {
  /** Distinct package names in this graph. */
  readonly names: readonly string[];
  readonly edges: readonly NameEdge[];
}

export interface UnionGraph {
  readonly nodes: ReadonlySet<string>;
  /** For each name, the names that depend directly on it. */
  readonly dependentsOf: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Merges nodes by name and edges by (dependent, dependency) pair. Self edges are dropped. */
export function unionGraph(graphs: readonly ResolvedGraph[]): UnionGraph {
  const nodes = new Set<string>();
  const dependentsOf = new Map<string, Set<string>>();
  for (const graph of graphs) {
    for (const name of graph.names) {
      nodes.add(name);
    }
    for (const [dependent, dependency] of graph.edges) {
      if (dependent === dependency) {
        continue;
      }
      nodes.add(dependent);
      nodes.add(dependency);
      let set = dependentsOf.get(dependency);
      if (set === undefined) {
        set = new Set<string>();
        dependentsOf.set(dependency, set);
      }
      set.add(dependent);
    }
  }
  return { nodes, dependentsOf };
}

/** Distinct names N != P from which P is reachable along one or more edges. */
export function transitiveReach(union: UnionGraph, name: string): number {
  const visited = new Set<string>();
  const queue: string[] = [name];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (current === undefined) {
      continue;
    }
    const dependents = union.dependentsOf.get(current);
    if (dependents === undefined) {
      continue;
    }
    for (const dependent of dependents) {
      if (dependent !== name && !visited.has(dependent)) {
        visited.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return visited.size;
}
