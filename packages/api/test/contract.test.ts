import { describe, expect, it } from "vitest";
import { REMEDIATION_KINDS, REMEDIATION_STATUSES } from "../src/contract.js";

describe("contract", () => {
  it("lists the three remediation kinds in order", () => {
    expect(REMEDIATION_KINDS).toEqual(["bump", "remove", "migrate"]);
  });

  it("lists the three remediation statuses in order", () => {
    expect(REMEDIATION_STATUSES).toEqual(["proposed", "no-safe-version", "unavailable"]);
  });
});
