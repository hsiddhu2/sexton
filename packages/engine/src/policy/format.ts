// Policy pretty printer. Spec: .kiro/specs/policy, Requirements 2.21 to 2.23. Pure and deterministic.

import { stringify } from "yaml";
import type { Policy, Rule } from "../types.js";

function formatRule(rule: Rule): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (rule.name !== undefined) {
    out["name"] = rule.name;
  }
  out["type"] = rule.type;
  switch (rule.type) {
    case "forbid_state":
      out["states"] = [...rule.states];
      break;
    case "forbid_install_scripts":
      if (rule.allow !== undefined) {
        out["allow"] = [...rule.allow];
      }
      break;
    case "max_age_months":
      out["months"] = rule.months;
      break;
    case "require_provenance":
      out["packages"] = [...rule.packages];
      break;
  }
  if (rule.matchPackageNames !== undefined) {
    out["matchPackageNames"] = [...rule.matchPackageNames];
  }
  if (rule.matchPackagePatterns !== undefined) {
    out["matchPackagePatterns"] = [...rule.matchPackagePatterns];
  }
  if (rule.excludePackageNames !== undefined) {
    out["excludePackageNames"] = [...rule.excludePackageNames];
  }
  return out;
}

/** Returns YAML text for a valid policy. Parsing the text gives back an equal policy. */
export function formatPolicy(policy: Policy): string {
  return stringify(
    { version: policy.version, rules: policy.rules.map(formatRule) },
    { lineWidth: 0, indent: 2, sortMapEntries: false },
  );
}
