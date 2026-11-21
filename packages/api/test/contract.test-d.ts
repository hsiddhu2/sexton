import { describe, expectTypeOf, it } from "vitest";
import type { REMEDIATION_STATUSES, RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATE_ORDER } from "@sexton/engine";
import type {
  HealthReport,
  PolicyResult,
  PrIntent,
  ReviewComment,
  RemediationEntry,
  RemediationStatusList,
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

  it("RemediationEntry has the remediation spec shape", () => {
    expectTypeOf<RemediationEntry["status"]>().toEqualTypeOf<"proposed" | "no-safe-version" | "unavailable">();
    expectTypeOf<RemediationEntry["summary"]>().toEqualTypeOf<string>();
    expectTypeOf<RemediationEntry["intent"]>().toEqualTypeOf<PrIntent | undefined>();
    expectTypeOf<PrIntent["baseRef"]>().toEqualTypeOf<"@default">();
    expectTypeOf<PrIntent["reviewComments"]>().toEqualTypeOf<readonly ReviewComment[]>();
    expectTypeOf<PrIntent["files"][0]["path"]>().toEqualTypeOf<"package.json">();
    expectTypeOf<PrIntent["files"][0]["op"]>().toEqualTypeOf<"set-range" | "remove-dependency" | "add-dependency">();
    expectTypeOf<Same<RemediationStatusList, typeof REMEDIATION_STATUSES>>().toEqualTypeOf<true>();
  });
});
