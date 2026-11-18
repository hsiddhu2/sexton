// The embedded policy JSON Schema and its compiled validator. Spec: .kiro/specs/policy, Requirements 1.1 to 1.7.
// The schema is a constant. Policy text never reaches compile, so no code is generated from policy data.

import Ajv2020Module from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { STATE_ORDER } from "../types.js";

type JsonSchema = { readonly [key: string]: unknown };

/** The pattern character set. Requirement 1.4, 2.19. */
export const PATTERN_CHARACTER_SET = "^[A-Za-z0-9@/._*?-]+$";

const NAME_LIST = { type: "array", items: { type: "string", minLength: 1 } } as const;

function ruleBranch(type: string, then: JsonSchema): JsonSchema {
  return {
    if: { required: ["type"], properties: { type: { const: type } } },
    then,
  };
}

export const POLICY_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Sexton policy",
  type: "object",
  additionalProperties: false,
  required: ["version", "rules"],
  properties: {
    version: { const: 1 },
    rules: { type: "array", items: { $ref: "#/$defs/rule" } },
  },
  $defs: {
    nameList: NAME_LIST,
    patternList: {
      type: "array",
      items: { type: "string", minLength: 1, pattern: PATTERN_CHARACTER_SET },
    },
    rule: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { enum: ["forbid_state", "forbid_install_scripts", "max_age_months", "require_provenance"] },
        name: { type: "string", minLength: 1, maxLength: 80 },
        matchPackageNames: { $ref: "#/$defs/nameList" },
        matchPackagePatterns: { $ref: "#/$defs/patternList" },
        excludePackageNames: { $ref: "#/$defs/nameList" },
        states: true,
        allow: true,
        months: true,
        packages: true,
      },
      allOf: [
        ruleBranch("forbid_state", {
          required: ["states"],
          properties: {
            states: { type: "array", minItems: 1, items: { enum: [...STATE_ORDER] } },
            allow: false,
            months: false,
            packages: false,
          },
        }),
        ruleBranch("forbid_install_scripts", {
          properties: {
            allow: { $ref: "#/$defs/nameList" },
            states: false,
            months: false,
            packages: false,
          },
        }),
        ruleBranch("max_age_months", {
          required: ["months"],
          properties: {
            months: { type: "integer", minimum: 1 },
            states: false,
            allow: false,
            packages: false,
          },
        }),
        ruleBranch("require_provenance", {
          required: ["packages"],
          properties: {
            packages: {
              oneOf: [
                { const: ["*"] },
                {
                  type: "array",
                  minItems: 1,
                  items: { type: "string", minLength: 1, not: { const: "*" } },
                },
              ],
            },
            states: false,
            allow: false,
            months: false,
          },
        }),
      ],
    },
  },
};

// Under NodeNext the default import of this CommonJS module is typed as the module namespace.
// One typed cast takes the constructor from `.default`.
type Ajv2020Constructor = new (options: Record<string, unknown>) => {
  compile(schema: JsonSchema): ValidateFunction;
};
const Ajv2020 = (Ajv2020Module as unknown as { default: Ajv2020Constructor }).default;

/** Compiled once at module load. A schema bug fails loudly on import. */
export const validatePolicySchema: ValidateFunction = new Ajv2020({
  strict: true,
  allErrors: true,
  allowUnionTypes: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
}).compile(POLICY_SCHEMA);
