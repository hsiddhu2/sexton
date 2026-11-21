// The sample repository against the recorded data, checked by hand in test/fixtures/migration/expected-migration.md.
// Spec: .kiro/specs/migration-node-sass, Requirement 4.11, task 8.2.

import { describe, expect, it } from "vitest";
import { attachRemediations } from "../../src/remediation/attach.js";
import { InMemoryFileSource } from "../../src/remediation/file-source.js";
import { gatherMigrationData } from "../../src/remediation/gather-migration-data.js";
import { planRemediation } from "../../src/remediation/plan.js";
import { NOTE_SASS_LOADER_RAISED } from "../../src/remediation/recipe-notes.js";
import { runMigrations } from "../../src/remediation/run-migrations.js";
import type { HealthReport } from "../../src/types.js";
import { healthySignals } from "./arbitraries.js";
import { migrationTransport, sampleFiles, sampleView } from "./migration-recorded.js";
import { contextFor } from "./routes.js";

describe("recorded migration of the sample repository", () => {
  it("3 edits, 4 review sites, filesChanged package.json, as checked by hand", async () => {
    const view = sampleView();
    const { transport, urls } = migrationTransport();
    const data = await gatherMigrationData(contextFor(transport), view);
    expect(urls.filter((u) => u.startsWith("https://registry.npmjs.org/"))).toHaveLength(2);
    expect(urls.filter((u) => u.endsWith("/querybatch"))).toHaveLength(2);
    expect(urls).toHaveLength(4);

    const report: HealthReport = {
      generatedAt: "2026-11-21T00:00:00.000Z",
      packages: [{ name: "node-sass", installedVersion: "7.0.3", state: "Dead", stateReason: "deprecated", signals: healthySignals(), missingSignals: [] }],
    };
    const options = { intake: view.packages };
    const migrations = await runMigrations(report, options, { packageJson: view, files: new InMemoryFileSource(sampleFiles()), data });
    const [plan] = planRemediation(report, { ...options, migrations });
    expect(plan?.status).toBe("proposed");
    expect(plan?.edits).toEqual([
      { path: "package.json", op: "remove-dependency", section: "devDependencies", name: "node-sass" },
      { path: "package.json", op: "add-dependency", section: "devDependencies", name: "sass", range: "^1.108.2" },
      { path: "package.json", op: "set-range", section: "devDependencies", name: "sass-loader", range: "^7.2.0" },
    ]);
    expect(plan?.migration).toEqual({
      recipeId: "node-sass-to-sass",
      from: "node-sass",
      to: "sass",
      filesChanged: ["package.json"],
      reviewSites: [
        { path: "package.json", line: null, rule: "node-sass-script", excerpt: "build:css" },
        { path: "scripts/compile.js", line: 3, rule: "legacy-render", excerpt: 'sass.render({ file: "src/styles/app.scss" }, (err, result) => {' },
        { path: "scripts/compile.js", line: 8, rule: "legacy-render", excerpt: 'const once = sass.renderSync({ file: "src/styles/theme.scss" });' },
        { path: "src/styles/app.scss", line: 3, rule: "deep-combinator", excerpt: ".card /deep/ .title {" },
      ],
      scan: { performed: true, listed: 4, read: 3, skipped: 0, capped: false },
      notes: [NOTE_SASS_LOADER_RAISED],
    });

    const [entry] = attachRemediations(report, { source: "default", pass: true, rules: [] }, [plan as NonNullable<typeof plan>]);
    expect(entry?.title).toBe("Sexton: migrate node-sass to sass");
    expect(entry?.intent?.branch).toBe("sexton/migrate-node-sass");
    expect(entry?.intent?.files).toEqual(plan?.edits);
    expect(entry?.intent?.reviewComments.map((c) => [c.path, c.line])).toEqual([
      ["package.json", null],
      ["scripts/compile.js", 3],
      ["scripts/compile.js", 8],
      ["src/styles/app.scss", 3],
    ]);
    const body = entry?.prBody ?? "";
    for (const heading of ["## Proposed change", "## Files changed", "## Review before merging", "## Lockfile"]) expect(body).toContain(heading);
    expect(body).toContain("- Remove `node-sass` from `devDependencies`.");
    expect(body).toContain("- Add `sass` `1.108.2` to `devDependencies` with a caret range.");
    expect(body).toContain("- Raise `sass-loader` to `7.2.0`, range style preserved.");
    expect(body).toContain("- `src/styles/app.scss:3` deep-combinator: `.card /deep/ .title {`");
    expect(body).toContain(`${NOTE_SASS_LOADER_RAISED}.`);
    expect(body).not.toContain("node_modules");
    expect(body.indexOf("## Failing policy rules")).toBeLessThan(body.indexOf("## Files changed"));
    expect(body.indexOf("## Review before merging")).toBeLessThan(body.indexOf("## Lockfile"));
  });
});
