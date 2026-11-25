// The fixture recorder asks the same URLs as the clients. Spec submission-readiness, Requirement 5.5.
// Static check only: the recorder needs the network and is never run in tests.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/record-fixtures.mjs"), "utf8");

describe("record-fixtures.mjs URL builders (5.5)", () => {
  it("imports the builders from the built engine", () => {
    expect(source).toContain('import { ABBREVIATED_ACCEPT, OSV_API, packumentUrl } from "../dist/index.js";');
    expect(source).toContain('import { attestationsUrl } from "../dist/clients/attestations.js";');
    expect(source).toContain('import { dependenciesUrl } from "../dist/clients/deps-dev.js";');
  });

  it("defines no copy of a builder and writes no registry, OSV or deps.dev URL itself", () => {
    for (const name of ["attestationsUrl", "dependenciesUrl", "packumentUrl", "encodeName"]) expect(source).not.toMatch(new RegExp(`function ${name}\\b`));
    expect(source).not.toMatch(/const ABBREVIATED_ACCEPT\b/);
    for (const host of ["registry.npmjs.org", "api.osv.dev", "api.deps.dev"]) expect(source).not.toContain(host);
  });
});
