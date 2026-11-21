import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertRegion, REGION, secretName, stackName, tableName, SNAPSHOTTER_SCHEDULE_EXPRESSION, SNAPSHOTTER_CRON } from "../lib/config.js";
import { buildApp } from "../lib/app.js";

describe("config", () => {
  it("builds the names of design.md", () => {
    expect(stackName("SextonData", "dev")).toBe("SextonData-dev");
    expect(stackName("SextonEdge", "dev")).toBe("SextonEdge-dev");
    expect(tableName("sexton-cache", "dev")).toBe("sexton-cache-dev");
    expect(tableName("sexton-snapshots", "dev")).toBe("sexton-snapshots-dev");
    expect(secretName("dev")).toBe("sexton/github-token-dev");
  });

  it("keeps the cron fields and the written expression in step", () => {
    expect(SNAPSHOTTER_SCHEDULE_EXPRESSION).toBe(`cron(${SNAPSHOTTER_CRON.minute} ${SNAPSHOTTER_CRON.hour} * * ? *)`);
  });

  it("accepts us-east-1", () => {
    expect(assertRegion(REGION)).toBe("us-east-1");
  });

  // Requirement 1.2: any other region is refused with a message naming us-east-1.
  it("Feature: infra, region guard: refuses every other region", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom("eu-west-1", "us-east-2", "US-EAST-1", "us-east-1 ", "")), (region) => {
        fc.pre(region !== REGION);
        expect(() => assertRegion(region)).toThrow(/us-east-1/);
      }),
      { numRuns: 100 },
    );
    expect(() => assertRegion(undefined)).toThrow(/us-east-1/);
  });

  it("refuses to build the app for another region", () => {
    expect(() =>
      buildApp({ region: "eu-west-1", scanCode: { kind: "placeholder" }, snapshotterCode: { kind: "placeholder" }, webAssetPath: null }),
    ).toThrow(/us-east-1/);
  });
});
