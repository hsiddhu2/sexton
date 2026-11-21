import { describe, expectTypeOf, it } from "vitest";
import type { RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATE_ORDER } from "@sexton/engine";
import type {
  HealthReport,
  PolicyResult,
  RemediationEntry,
  RuleTypeList,
  ScanResponse,
  SeverityList,
  SignalNameList,
  StateList,
} from "../src/contract.js";

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

describe("contract types", () => {
  it("ScanResponse has report, policy and optional remediations", () => {
    expectTypeOf<ScanResponse["report"]>().toEqualTypeOf<HealthReport>();
    expectTypeOf<ScanResponse["policy"]>().toEqualTypeOf<PolicyResult>();
    expectTypeOf<ScanResponse["remediations"]>().toEqualTypeOf<readonly RemediationEntry[] | undefined>();
  });

  it("list types equal the engine tuple types in members and order", () => {
    expectTypeOf<Same<SignalNameList, typeof SIGNAL_NAMES>>().toEqualTypeOf<true>();
    expectTypeOf<Same<StateList, typeof STATE_ORDER>>().toEqualTypeOf<true>();
    expectTypeOf<Same<SeverityList, typeof SEVERITIES>>().toEqualTypeOf<true>();
    expectTypeOf<Same<RuleTypeList, typeof RULE_TYPES>>().toEqualTypeOf<true>();
  });

  it("RemediationEntry.kind is bump, remove or migrate", () => {
    expectTypeOf<RemediationEntry["kind"]>().toEqualTypeOf<"bump" | "remove" | "migrate">();
  });
});
