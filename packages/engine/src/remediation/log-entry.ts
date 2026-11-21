// Remediation log entry rules. Spec: .kiro/specs/remediation, Requirement 6.1. Pure, never throws.

import { isValidPackageName } from "../intake/names.js";
import { parseRepoUrl } from "../intake/url.js";
import { REMEDIATION_KINDS, type RemediationLogEntry } from "../types.js";
import { BRANCH_PREFIX, MAX_BRANCH_LENGTH } from "./branch-name.js";
import { isValidBranchName } from "./is-valid-branch-name.js";

export const LOG_FIELDS = ["repository", "branch", "prUrl", "package", "kind", "timestamp"] as const;
export const MAX_PR_URL_LENGTH = 2048;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f]/;

function str(value: unknown): value is string {
  return typeof value === "string";
}

export function isValidLogEntry(entry: unknown): entry is RemediationLogEntry {
  try {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const e = entry as Record<string, unknown>;
    if (!LOG_FIELDS.every((f) => Object.hasOwn(e, f) && str(e[f]))) return false;
    const { repository, branch, prUrl, kind, timestamp } = e as Record<(typeof LOG_FIELDS)[number], string>;
    const pkg = e["package"] as string;
    const repo = parseRepoUrl(repository);
    if (!repo.ok || repo.repo.url !== repository) return false;
    if (!branch.startsWith(BRANCH_PREFIX) || branch.length > MAX_BRANCH_LENGTH || !isValidBranchName(branch)) return false;
    if (!prUrl.startsWith("https://") || prUrl.length > MAX_PR_URL_LENGTH || WHITESPACE_OR_CONTROL.test(prUrl)) return false;
    if (!isValidPackageName(pkg)) return false;
    if (!(REMEDIATION_KINDS as readonly string[]).includes(kind)) return false;
    return ISO_INSTANT.test(timestamp) && Number.isFinite(Date.parse(timestamp));
  } catch {
    return false;
  }
}
