import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, REMEDIATION_KINDS, REMEDIATION_STATUSES, RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATES } from "../src/load/lists.js";

describe("literal lists", () => {
  it("match the expected members and order", () => {
    expect([...STATES]).toEqual(["Possessed", "Dead", "Haunted", "Restless", "Alive"]);
    expect([...SEVERITIES]).toEqual(["Critical", "High", "Moderate", "Low", "Unknown"]);
    expect([...SIGNAL_NAMES]).toEqual([
      "lastPublish",
      "deprecated",
      "hasInstallScript",
      "advisories",
      "maintainers",
      "provenance",
      "transitiveReach",
      "maintainerChange",
      "provenanceRegression",
      "newInstallScript",
      "publisherChange",
      "newDependency",
    ]);
    expect([...RULE_TYPES]).toEqual(["forbid_state", "forbid_install_scripts", "max_age_months", "require_provenance"]);
    expect([...REMEDIATION_KINDS]).toEqual(["bump", "remove", "migrate"]);
    expect([...REMEDIATION_STATUSES]).toEqual(["proposed", "no-safe-version", "unavailable"]);
  });

  // Spec clean-site, design C10: the error codes match the API's list, members and order, read from its source.
  it("mirrors the API's error codes", () => {
    const source = readFileSync(join(process.cwd(), "..", "api", "src", "http", "responses.ts"), "utf8");
    const literal = /export const API_ERROR_CODES = \[([^\]]*)\] as const;/.exec(source)?.[1] ?? "";
    const codes = [...literal.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    expect([...API_ERROR_CODES]).toEqual(codes);
  });
});
