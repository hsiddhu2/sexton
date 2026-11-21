// Type-level check: the scan's success body is the cemetery UI's ScanResponse. Requirement 4.6.

import { describe, expectTypeOf, it } from "vitest";
import type { ScanResponse } from "../src/contract.js";
import type { runScan, ScanOutcome } from "../src/scan.js";

describe("scan types", () => {
  it("a successful outcome carries a ScanResponse", () => {
    expectTypeOf<Extract<ScanOutcome, { ok: true }>["body"]>().toEqualTypeOf<ScanResponse>();
    expectTypeOf<Awaited<ReturnType<typeof runScan>>>().toEqualTypeOf<ScanOutcome>();
  });
});
