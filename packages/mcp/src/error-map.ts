// PipelineError to error code, by the CLI's message constants. Spec: .kiro/specs/sexton-power, Requirements 6.4, 11.2, 11.3. Pure.
import { MSG, type PipelineError } from "@sexton/cli";
import type { ErrorCode } from "./result.js";

const BY_MESSAGE: ReadonlyMap<string, ErrorCode> = new Map<string, ErrorCode>([
  [MSG.packageJsonMissing, "package-json-missing"],
  [MSG.packageJsonInvalid, "package-json-invalid"],
  [MSG.packageJsonTooLarge, "package-json-too-large"],
  [MSG.lockInvalid, "lockfile-invalid"],
  [MSG.lockTooLarge, "lockfile-too-large"],
  [MSG.policyInvalid, "policy-invalid"],
  [MSG.policyInvalidText, "policy-invalid"],
  [MSG.policyTooLarge, "policy-too-large"],
]);

/** The MSG keys the pipeline can return as the first line of a PipelineError. A test checks every one is mapped or listed as scan-failed. */
export const PIPELINE_MESSAGE_KEYS = [
  "cannotName",
  "badRepoFlag",
  "repoFlagWithRepository",
  "packageJsonMissing",
  "packageJsonTooLarge",
  "packageJsonInvalid",
  "lockTooLarge",
  "lockInvalid",
  "policyTooLarge",
  "policyInvalidText",
  "policyFetchFailed",
  "policyInvalid",
] as const;

export function errorCodeFor(error: PipelineError): ErrorCode {
  return BY_MESSAGE.get(error.lines[0] ?? "") ?? "scan-failed";
}

/** The `{ code, path }` entries the CLI prints after the policy-invalid header, at most 20. Lines look like "  <code> <path>". */
export function policyErrorDetail(error: PipelineError): { errors: { code: string; path: string }[]; truncated: boolean } {
  const rows = error.lines.slice(1).map((line) => {
    const trimmed = line.trim();
    const space = trimmed.indexOf(" ");
    return space < 0 ? { code: trimmed, path: "/" } : { code: trimmed.slice(0, space), path: trimmed.slice(space + 1) };
  });
  return { errors: rows.slice(0, 20), truncated: rows.length > 20 };
}
