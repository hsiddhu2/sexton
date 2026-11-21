import { describe, expect, it } from "vitest";
import { REMEDIATION_KINDS } from "../src/contract.js";

describe("contract", () => {
  it("lists the three remediation kinds in order", () => {
    expect(REMEDIATION_KINDS).toEqual(["bump", "remove", "migrate"]);
  });
});
