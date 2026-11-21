// Migration data fetch for the node-sass to sass recipe. Spec: .kiro/specs/migration-node-sass, Requirements 3.1, 3.5, 3.6.
// Same bounded fetch and caches as gatherBumpData. Never rejects; a failure degrades one package.

import type { ClientContext } from "../clients/context.js";
import type { BumpDataResult, MigrationData, PackageJsonView } from "../types.js";
import { sassCandidates, sassLoaderCandidates, sassLoaderNeed } from "./migration-candidates.js";
import { fail, gatherVersionData } from "./version-data.js";

async function safely(run: () => Promise<BumpDataResult>): Promise<BumpDataResult> {
  try {
    return await run();
  } catch {
    return fail("migration data could not be read");
  }
}

function listed(view: PackageJsonView, name: string): boolean {
  try {
    return view.packages.some((p) => p.name === name);
  } catch {
    return false;
  }
}

/** Nothing without node-sass; sass unless already listed; sass-loader only when listed below the minimum. */
export async function gatherMigrationData(ctx: ClientContext, view: PackageJsonView): Promise<MigrationData> {
  if (!listed(view, "node-sass")) return new Map();
  const need = (() => {
    try {
      return sassLoaderNeed(view.packages);
    } catch {
      return { kind: "absent" as const };
    }
  })();
  const [sass, loader] = await Promise.all([
    listed(view, "sass") ? Promise.resolve(undefined) : safely(() => gatherVersionData(ctx, "sass", sassCandidates)),
    need.kind === "raise" ? safely(() => gatherVersionData(ctx, "sass-loader", (p) => sassLoaderCandidates(p, need.effective))) : Promise.resolve(undefined),
  ]);
  const out = new Map<string, BumpDataResult>();
  if (sass !== undefined) out.set("sass", sass);
  if (loader !== undefined) out.set("sass-loader", loader);
  return out;
}
