import { describe, expect, it } from "vitest";
import { REMEDIATION_KINDS, REMEDIATION_STATUSES, RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATES } from "../src/load/lists.js";

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
});
