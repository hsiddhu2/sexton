import { describe, expect, it, vi } from "vitest";

const stub = vi.hoisted(() => {
  const validate = Object.assign((): boolean => false, { errors: [] as unknown });
  return validate;
});

vi.mock("../../src/policy/schema.js", () => ({
  validatePolicySchema: stub,
  POLICY_SCHEMA: {},
  PATTERN_CHARACTER_SET: "^[A-Za-z0-9@/._*?-]+$",
}));

import { parsePolicy } from "../../src/policy/parse.js";

const VALID = "version: 1\nrules:\n  - type: forbid_state\n    states: [Possessed, Dead]\n";
const EXPECTED = { ok: false, errors: [{ path: "", code: "WRONG_TYPE", message: "policy rejected by schema validation" }] };

describe("parsePolicy fails closed", () => {
  it.each([["an empty errors list", []], ["null errors", null], ["undefined errors", undefined]])(
    "Requirement 2.26: validator false with %s gives one WRONG_TYPE error",
    (_label, errors) => {
      stub.errors = errors;
      expect(parsePolicy(VALID)).toEqual(EXPECTED);
    },
  );
});
