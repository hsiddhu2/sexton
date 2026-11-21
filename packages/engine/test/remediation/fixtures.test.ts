// Expected plans for the recorded fixtures, checked by hand in test/fixtures/remediation/expected-plans.md.
// Spec: .kiro/specs/remediation, task 10.2, Requirements 1.2, 2.9, 2.13, 2.17, 2.24.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bumpTargets } from "../../src/remediation/bump-targets.js";
import { gatherBumpData } from "../../src/remediation/gather-bump-data.js";
import { planRemediation } from "../../src/remediation/plan.js";
import { EMPTY_RECIPE_REGISTRY } from "../../src/remediation/recipes.js";
import type { HealthReport, IntakePackage } from "../../src/types.js";
import { healthySignals } from "./arbitraries.js";
import { recordedPackages, recordedTransport, REMEDIATION_DIR } from "./recorded.js";
import { contextFor } from "./routes.js";

interface Expected {
  packageName: string;
  installedVersion: string;
  kind: string;
  status: string;
  reason?: string;
  chosenVersion?: string;
  majorUpgrade?: boolean;
  range?: string;
}

describe("recorded remediation fixtures", () => {
  it("plan as checked by hand", async () => {
    const expected = (JSON.parse(readFileSync(join(REMEDIATION_DIR, "expected-plans.json"), "utf8")) as { plans: Expected[] }).plans;
    const recorded = recordedPackages();
    expect(recorded.map((r) => r.name).sort()).toEqual(expected.map((e) => e.packageName).sort());
    const order = expected.map((e) => recorded.find((r) => r.name === e.packageName) as (typeof recorded)[number]);
    const report: HealthReport = {
      generatedAt: "2026-11-21T00:00:00.000Z",
      packages: order.map((r) => ({ ...r, state: "Dead", stateReason: "deprecated", signals: healthySignals(), missingSignals: [] })),
    };
    const intake: IntakePackage[] = order.map((r) => ({ ...r, declaredRange: `^${r.installedVersion}`, origin: "dependencies", resolution: "locked" }));
    const { transport, urls } = recordedTransport();
    const bumpData = await gatherBumpData(contextFor(transport), bumpTargets(report, { intake, recipes: EMPTY_RECIPE_REGISTRY }));
    // One querybatch each for uuid, lodash, event-stream and node-sass; none for the three with no candidate.
    expect(urls.filter((u) => u.endsWith("/querybatch")).length).toBe(4);
    const plans = planRemediation(report, { intake, bumpData, recipes: EMPTY_RECIPE_REGISTRY });
    expect(
      plans.map((p) => ({
        packageName: p.packageName,
        installedVersion: p.installedVersion,
        kind: p.kind,
        status: p.status,
        ...(p.reason !== undefined ? { reason: p.reason } : {}),
        ...(p.chosenVersion !== undefined ? { chosenVersion: p.chosenVersion } : {}),
        ...(p.majorUpgrade !== undefined ? { majorUpgrade: p.majorUpgrade } : {}),
        ...(p.edit?.op === "set-range" ? { range: p.edit.range } : {}),
      })),
    ).toEqual(expected);
  });
});
