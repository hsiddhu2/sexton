// The newDependency signal. Spec new-signals, Requirement 2. Reads the packuments of each new dependency name, at
// most five, through the cache. Never throws.

import { detailNames, dependencyDiff, isResolvable, newDependencyValue, resolveDependency, type DocRead } from "../new-dependency.js";
import { available, unavailable } from "../signal.js";
import type { NewDependencyEntry, NewDependencyValue, Signal } from "../types.js";
import { describeFailure, type ClientContext } from "./context.js";
import type { PackumentDocument } from "./maintainers.js";
import { readAbbreviatedPackument, readFullPackument } from "./npm.js";

async function read(fn: () => Promise<unknown>): Promise<DocRead> {
  try {
    return { ok: true, doc: await fn() };
  } catch (error) {
    return { ok: false, reason: describeFailure(error) };
  }
}

const NOT_READ: DocRead = { ok: false, reason: "not read" };

/** Builds the signal from the package's full packument read. One name at a time, both reads cached. */
export async function fetchNewDependencySignal(
  ctx: ClientContext,
  installed: string,
  full: PackumentDocument,
): Promise<Signal<NewDependencyValue>> {
  const at = new Date(full.fetchedAt);
  if (!full.ok) return unavailable(full.reason, full.source, at);
  try {
    const diff = dependencyDiff(full.doc, installed);
    const details: NewDependencyEntry[] = [];
    for (const dep of detailNames(diff)) {
      const valid = isResolvable(dep);
      const depFull = valid ? await read(() => readFullPackument(ctx, dep.name)) : NOT_READ;
      // The abbreviated document is useless without the full one: resolving needs the time map.
      const depAbbreviated = depFull.ok ? await read(() => readAbbreviatedPackument(ctx, dep.name)) : NOT_READ;
      const parentMs = diff.status === "compared" ? diff.installedPublishMs : Number.NaN;
      details.push(resolveDependency(dep, parentMs, depFull, depAbbreviated));
    }
    return available(newDependencyValue(diff, details), full.source, at);
  } catch (error) {
    return unavailable(describeFailure(error), full.source, at);
  }
}
