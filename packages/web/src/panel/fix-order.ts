// The Fix order (spec clean-site, design C3, requirements 3.18, 3.19 and 3.22): up to 5 packages, the first Possessed,
// Dead and Haunted ones in triage order at the scan date, each with one line of what to do. Pure.
import type { PackageHealth, RemediationEntry, State } from "@sexton/api";
import { triageOrder } from "../triage/triage.js";
import { reasonFamily, type Family } from "./reason-family.js";

export const MAX_FIX_ROWS = 5;
export const NOTHING_TO_FIX = "Nothing to fix. Every dependency is Restless or Alive.";

export interface FixRow {
  readonly name: string;
  readonly version: string;
  readonly state: State;
  readonly line: string;
}

const FIXABLE: ReadonlySet<State> = new Set<State>(["Possessed", "Dead", "Haunted"]);

const POSSESSED_LINE: Partial<Record<Family, string>> = {
  maintainer: "review the maintainer change",
  provenance: "review the missing provenance",
  "install-script": "review the new install script",
  "new-dependency": "review the new dependency",
  publisher: "review the publisher change",
};

/** The plan for each package name: the first entry wins. Own keys only. */
export function plansByName(plans: readonly RemediationEntry[] | undefined): ReadonlyMap<string, RemediationEntry> {
  const out = new Map<string, RemediationEntry>();
  for (const plan of plans ?? []) if (!out.has(plan.packageName)) out.set(plan.packageName, plan);
  return out;
}

function proposedLine(plan: RemediationEntry): string | null {
  if (plan.status !== "proposed") return null;
  if (plan.kind === "bump") return plan.chosenVersion === undefined ? null : `bump to ${plan.chosenVersion}`;
  if (plan.kind === "remove") return "remove it";
  // The edits are only checked as an array at load, so each one is read with a guard.
  const edits: readonly unknown[] = plan.intent?.files ?? [];
  for (const edit of edits) {
    if (typeof edit !== "object" || edit === null) continue;
    const { op, name } = edit as { readonly op?: unknown; readonly name?: unknown };
    if (op === "add-dependency" && typeof name === "string") return `migrate to ${name}`;
  }
  return null;
}

/** Pure. The first line of 3.19 that applies to a package and its plan. */
export function fixLine(pkg: PackageHealth, plan: RemediationEntry | undefined): string {
  const proposed = plan === undefined ? null : proposedLine(plan);
  if (proposed !== null) return proposed;
  if (pkg.state === "Possessed") {
    const family = reasonFamily(pkg.stateReason);
    const line = family === null ? undefined : POSSESSED_LINE[family];
    if (line !== undefined) return line;
  }
  if (plan?.status === "no-safe-version") return "no safe version";
  return "see the evidence";
}

/** Pure. The Fix order rows; empty when nothing is Possessed, Dead or Haunted (then NOTHING_TO_FIX shows, 3.22). */
export function fixOrder(packages: readonly PackageHealth[], plans: readonly RemediationEntry[] | undefined): FixRow[] {
  const byName = plansByName(plans);
  return triageOrder(packages)
    .filter((pkg) => FIXABLE.has(pkg.state))
    .slice(0, MAX_FIX_ROWS)
    .map((pkg) => ({ name: pkg.name, version: pkg.installedVersion, state: pkg.state, line: fixLine(pkg, byName.get(pkg.name)) }));
}
