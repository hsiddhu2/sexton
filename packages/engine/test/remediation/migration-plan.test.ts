// Spec: .kiro/specs/migration-node-sass, Requirements 5, 6, 9.3, properties 25 and 26.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { attachRemediations } from "../../src/remediation/attach.js";
import { InMemoryFileSource } from "../../src/remediation/file-source.js";
import { planRemediation, REASON_MIGRATION_NOT_RUN, REASON_NO_CHANGE } from "../../src/remediation/plan.js";
import { buildPrBody, LOCKFILE_NOTE } from "../../src/remediation/pr-body.js";
import { buildPrContext } from "../../src/remediation/pr-context.js";
import { buildPrIntent } from "../../src/remediation/pr-intent.js";
import { NOTE_NOT_SCANNED } from "../../src/remediation/recipe-notes.js";
import { runMigrations } from "../../src/remediation/run-migrations.js";
import type { BumpDataResult, HealthReport, IntakePackage, PolicyResult, RecipeOutcome } from "../../src/types.js";
import { arbReportAndOptions, healthySignals, MARKER, stubRecipe } from "./arbitraries.js";
import { arbFileSet, arbScripts } from "./migration-arbitraries.js";

const POLICY: PolicyResult = { source: "default", pass: true, rules: [] };
const dep = (name: string, origin: IntakePackage["origin"] = "devDependencies"): IntakePackage => ({ name, installedVersion: "7.0.3", declaredRange: "^7.0.3", origin, resolution: "locked" });
const report = (name = "node-sass"): HealthReport => ({
  generatedAt: "2026-11-21T00:00:00.000Z",
  packages: [{ name, installedVersion: "7.0.3", state: "Dead", stateReason: "deprecated", signals: healthySignals(), missingSignals: [] }],
});
const sassData: BumpDataResult = { ok: true, published: ["1.2.0"], deprecated: new Set(), advisories: new Map([["1.2.0", []]]) };

/** Removes every inline code span, which is where escapeField puts text from outside the engine. */
const outsideSpans = (body: string): string => body.replace(/`[^`\n]*`/g, "");

describe("migrate plans, intents and bodies", () => {
  it("Feature: migration-node-sass, Property 25: Only package.json is ever edited", () => {
    fc.assert(
      fc.property(arbReportAndOptions, ({ report: r, options }) => {
        for (const plan of planRemediation(r, options)) {
          const ctx = buildPrContext(r, POLICY, plan.packageName);
          if (ctx === null) continue;
          const intent = buildPrIntent(plan, ctx);
          if (intent === null) continue;
          expect(intent.files.length).toBeGreaterThan(0);
          for (const e of intent.files) {
            expect(e.path).toBe("package.json");
            expect(Object.keys(e).every((k) => ["path", "op", "section", "name", "range"].includes(k))).toBe(true);
          }
          if (plan.kind !== "migrate") expect(intent.reviewComments).toEqual([]);
          for (const c of intent.reviewComments) expect(c.path === "package.json" || plan.migration?.reviewSites.some((s) => s.path === c.path)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: migration-node-sass, Property 26: No unescaped file line in the body", async () => {
    await fc.assert(
      fc.asyncProperty(arbFileSet, arbScripts, fc.boolean(), async (files, scripts, small) => {
        const view = { packages: [dep("node-sass"), dep("sass")], scripts };
        const migrations = await runMigrations(report(), {}, { packageJson: view, files: new InMemoryFileSource(files), data: new Map() });
        const [plan] = planRemediation(report(), { migrations });
        if (plan === undefined || plan.status !== "proposed") throw new Error("not proposed");
        const ctx = buildPrContext(report(), POLICY, "node-sass");
        if (ctx === null) throw new Error("context");
        const body = buildPrBody(plan, ctx);
        expect(outsideSpans(body)).not.toContain(MARKER);
        for (const c of buildPrIntent(plan, ctx)?.reviewComments ?? []) expect(outsideSpans(c.body)).not.toContain(MARKER);
        for (const line of body.split("\n")) expect(line.includes("\r")).toBe(false);
        if (small) expect(body.length).toBeLessThanOrEqual(60000);
      }),
      { numRuns: 1000 },
    );
  });

  it("unavailable reasons: not run, data failure, no change, branch too long", async () => {
    const failure: RecipeOutcome = { ok: false, reason: "migration data unavailable: packument request failed (HTTP 500)" };
    const scan = { performed: false, listed: 0, read: 0, skipped: 0, capped: false };
    const empty: RecipeOutcome = { ok: true, result: { edits: [], reviewSites: [], filesChanged: [], scan, notes: [] } };
    expect(planRemediation(report(), {})[0]).toMatchObject({ kind: "migrate", status: "unavailable", reason: REASON_MIGRATION_NOT_RUN });
    expect(planRemediation(report(), { migrations: new Map([["node-sass", failure]]) })[0]).toMatchObject({ status: "unavailable", reason: failure.ok ? "" : failure.reason });
    expect(planRemediation(report(), { migrations: new Map([["node-sass", empty]]) })[0]).toMatchObject({ status: "unavailable", reason: REASON_NO_CHANGE });
    const long = `a${"_".repeat(150)}`;
    const recipes = new Map([[long, stubRecipe("x")]]);
    const edit = { path: "package.json" as const, op: "remove-dependency" as const, section: "dependencies" as const, name: long };
    const ok: RecipeOutcome = { ok: true, result: { edits: [edit], reviewSites: [], filesChanged: ["package.json"], scan, notes: [] } };
    expect(planRemediation(report(long), { recipes, migrations: new Map([[long, ok]]) })[0]).toMatchObject({ status: "unavailable", reason: "branch name too long" });
    const entries = attachRemediations(report(), POLICY, planRemediation(report(), {}));
    expect(entries[0]?.title).toBe("Sexton: no change proposed for node-sass");
    expect(entries[0]?.intent).toBeUndefined();
  });

  it("a hosted-style run without files still proposes the edits and says what was not scanned", async () => {
    const view = { packages: [dep("node-sass", "dependencies")], scripts: new Map([["css", "node-sass a"]]) };
    const migrations = await runMigrations(report(), {}, { packageJson: view, files: undefined, data: new Map([["sass", sassData]]) });
    const plans = planRemediation(report(), { migrations });
    const [entry] = attachRemediations(report(), POLICY, plans);
    expect(entry?.title).toBe("Sexton: migrate node-sass to sass");
    expect(entry?.summary).toBe("Migrate node-sass to sass");
    expect(entry?.intent?.files).toEqual([
      { path: "package.json", op: "remove-dependency", section: "dependencies", name: "node-sass" },
      { path: "package.json", op: "add-dependency", section: "dependencies", name: "sass", range: "^1.2.0" },
    ]);
    const body = entry?.prBody ?? "";
    expect(body).toContain("## Files changed\n\n- `package.json`");
    expect(body).toContain("- `package.json` node-sass-script: `css`");
    expect(body).toContain(`${NOTE_NOT_SCANNED}.`);
    expect(body).toContain("Stylesheets and scripts: not scanned.");
    expect(body).toContain("The edit removes it from every dependency section of package.json that lists it.");
    expect(body).not.toContain("\nnone\n");
    expect(body).toContain(LOCKFILE_NOTE);
    expect(body.indexOf(NOTE_NOT_SCANNED)).toBeLessThan(body.indexOf("## Lockfile"));
  });

  it("lists at most 20 sites then 'and N more', and 'none' when the scan found nothing", async () => {
    const many = new Map(Array.from({ length: 25 }, (_, i) => [`s${String(i).padStart(2, "0")}.scss`, ".a /deep/ .b {}"]));
    const run = async (files: Map<string, string>): Promise<string> => {
      const migrations = await runMigrations(report(), {}, { packageJson: { packages: [dep("node-sass"), dep("sass")], scripts: new Map() }, files: new InMemoryFileSource(files), data: new Map() });
      const [plan] = planRemediation(report(), { migrations });
      const ctx = buildPrContext(report(), POLICY, "node-sass");
      return plan !== undefined && ctx !== null ? buildPrBody(plan, ctx) : "";
    };
    const body = await run(many);
    expect(body.match(/ deep-combinator: /g)).toHaveLength(20);
    expect(body).toContain("and 5 more");
    expect(await run(new Map([["a.scss", ".a {}"]]))).toContain("## Review before merging\n\nnone\n");
  });

  it("renders only fixed notes", () => {
    const scan = { performed: true, listed: 0, read: 0, skipped: 0, capped: false };
    const edit = { path: "package.json" as const, op: "remove-dependency" as const, section: "dependencies" as const, name: "node-sass" };
    const outcome: RecipeOutcome = { ok: true, result: { edits: [edit], reviewSites: [], filesChanged: ["package.json"], scan, notes: [`# injected ${MARKER}`, NOTE_NOT_SCANNED] } };
    const [plan] = planRemediation(report(), { migrations: new Map([["node-sass", outcome]]) });
    const ctx = buildPrContext(report(), POLICY, "node-sass");
    if (plan === undefined || ctx === null) throw new Error("plan");
    const body = buildPrBody(plan, ctx);
    expect(body).not.toContain(MARKER);
    expect(body).toContain(NOTE_NOT_SCANNED);
  });
});
