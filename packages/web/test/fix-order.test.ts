// Spec clean-site, design C3 and Property 4: the Fix order is the triage order of what needs fixing (3.18, 3.19, 3.22).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageHealth, RemediationEntry, State } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STATES } from "../src/load/lists.js";
import { fixLine, fixOrder, MAX_FIX_ROWS } from "../src/panel/fix-order.js";
import { triageOrder } from "../src/triage/triage.js";
import { arbTriagePackages, cheapPackage } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

const REASONS = (JSON.parse(readFileSync(join(process.cwd(), "test", "fixtures", "engine-reasons.json"), "utf8")) as { reason: string }[]).map((r) => r.reason);
const FIXABLE = new Set<State>(["Possessed", "Dead", "Haunted"]);

type PlanShape = "none" | "bump" | "bump-no-version" | "remove" | "migrate" | "migrate-no-target" | "no-safe-version" | "unavailable";
const PLAN_SHAPES: readonly PlanShape[] = ["none", "bump", "bump-no-version", "remove", "migrate", "migrate-no-target", "no-safe-version", "unavailable"];

function planFor(name: string, shape: PlanShape): RemediationEntry | null {
  const base = { packageName: name, title: "t", summary: "s", prBody: "b" };
  switch (shape) {
    case "none":
      return null;
    case "bump":
      return { ...base, kind: "bump", status: "proposed", chosenVersion: "9.9.9" };
    case "bump-no-version":
      return { ...base, kind: "bump", status: "proposed" };
    case "remove":
      return { ...base, kind: "remove", status: "proposed" };
    case "migrate":
    case "migrate-no-target": {
      const files =
        shape === "migrate"
          ? [{ path: "package.json", op: "remove-dependency", section: "dependencies", name }, { path: "package.json", op: "add-dependency", section: "dependencies", name: "sass", range: "^1" }]
          : [{ path: "package.json", op: "remove-dependency", section: "dependencies", name }];
      return { ...base, kind: "migrate", status: "proposed", intent: { branch: "b", title: "t", body: "b", files, baseRef: "@default", reviewComments: [] } } as unknown as RemediationEntry;
    }
    case "no-safe-version":
      return { ...base, kind: "bump", status: "no-safe-version" };
    case "unavailable":
      return { ...base, kind: "bump", status: "unavailable" };
  }
}

/** The line of 3.19, written again from the requirement. */
function expectedLine(pkg: PackageHealth, shape: PlanShape): string {
  if (shape === "bump") return "bump to 9.9.9";
  if (shape === "remove") return "remove it";
  if (shape === "migrate") return "migrate to sass";
  if (pkg.state === "Possessed") {
    const r = pkg.stateReason;
    if (r.startsWith("maintainer change")) return "review the maintainer change";
    if (r.startsWith("provenance regression:")) return "review the missing provenance";
    if (r.startsWith("install script added in")) return "review the new install script";
    if (r.startsWith("new dependency in")) return "review the new dependency";
    if (r.startsWith("publisher changed in")) return "review the publisher change";
  }
  if (shape === "no-safe-version") return "no safe version";
  return "see the evidence";
}

const BIG: PackageHealth[] = Array.from({ length: 300 }, (_, i) => cheapPackage(`pkg-${String(i).padStart(3, "0")}`, STATES[(i * 7) % 5] ?? "Alive"));

const arbCase = fc
  .oneof(arbTriagePackages(40), fc.constant(BIG))
  .chain((packages) =>
    fc.tuple(
      fc.constant(packages),
      fc.array(fc.constantFrom(...REASONS, "r"), { minLength: packages.length, maxLength: packages.length }),
      fc.array(fc.constantFrom(...PLAN_SHAPES), { minLength: packages.length, maxLength: packages.length }),
    ),
  )
  .map(([packages, reasons, shapes]) => {
    const pkgs = packages.map((p, i) => ({ ...p, stateReason: reasons[i] ?? "r" }));
    const shapeOf = new Map(pkgs.map((p, i) => [p.name, shapes[i] ?? "none"] as const));
    const plans = pkgs.flatMap((p) => {
      const plan = planFor(p.name, shapeOf.get(p.name) ?? "none");
      return plan === null ? [] : [plan];
    });
    return { pkgs, plans, shapeOf };
  });

describe("Feature: clean-site, Property 4: Fix order is the triage order of what needs fixing", () => {
  it("lists at most 5 Possessed, Dead or Haunted packages, first in triage order with none skipped, each with its 3.19 line", () => {
    fc.assert(
      fc.property(arbCase, ({ pkgs, plans, shapeOf }) => {
        const rows = fixOrder(pkgs, plans);
        expect(rows.length).toBeLessThanOrEqual(MAX_FIX_ROWS);
        const expected = triageOrder(pkgs).filter((p) => FIXABLE.has(p.state)).slice(0, MAX_FIX_ROWS);
        expect(rows.map((r) => r.name)).toEqual(expected.map((p) => p.name));
        for (const [i, row] of rows.entries()) {
          const pkg = expected[i] as PackageHealth;
          expect(FIXABLE.has(row.state)).toBe(true);
          expect(row).toEqual({ name: pkg.name, version: pkg.installedVersion, state: pkg.state, line: expectedLine(pkg, shapeOf.get(pkg.name) ?? "none") });
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("fix order examples", () => {
  it("orders the Sample scan left-padder, event-stream, uuid, request, left-pad", () => {
    const demo = readDemoScan() as { report: { packages: PackageHealth[] }; remediations: RemediationEntry[] };
    expect(fixOrder(demo.report.packages, demo.remediations).map((r) => `${r.name}: ${r.line}`)).toEqual([
      "left-padder: review the maintainer change",
      "event-stream: bump to 4.0.0",
      "uuid: bump to 11.1.1",
      "request: no safe version",
      "left-pad: no safe version",
    ]);
  });

  it("gives no rows when every package is Restless or Alive", () => {
    expect(fixOrder([cheapPackage("a", "Alive"), cheapPackage("b", "Restless")], [])).toEqual([]);
  });

  it("guards an edit list that holds no object", () => {
    const plan = { packageName: "a", kind: "migrate", status: "proposed", title: "t", summary: "s", prBody: "b", intent: { files: [null, 3, { op: "add-dependency", name: 7 }] } } as unknown as RemediationEntry;
    expect(fixLine(cheapPackage("a", "Dead"), plan)).toBe("see the evidence");
  });
});
