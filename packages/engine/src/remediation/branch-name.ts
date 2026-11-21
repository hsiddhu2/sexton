// Branch names. Spec: .kiro/specs/remediation, Requirements 4.2, 4.3, 4.6, 4.8, 4.9, 8.3. Pure.

import { isValidPackageName } from "../intake/names.js";
import { REMEDIATION_KINDS, type RemediationKind } from "../types.js";
import { encodeName } from "./encoded-name.js";

export const BRANCH_PREFIX = "sexton/";
export const MAX_BRANCH_LENGTH = 200;

/** sexton/{kind}-{encoded name}, or null for an invalid kind or name, or a result over 200 characters. */
export function branchName(kind: RemediationKind, name: string): string | null {
  if (!(REMEDIATION_KINDS as readonly unknown[]).includes(kind)) return null;
  if (typeof name !== "string" || !isValidPackageName(name)) return null;
  const branch = `${BRANCH_PREFIX}${kind}-${encodeName(name)}`;
  return branch.length > MAX_BRANCH_LENGTH ? null : branch;
}
