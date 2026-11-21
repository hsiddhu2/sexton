// Every fixed text the CLI prints. Spec: .kiro/specs/cli-and-action, Requirements 3.4, 4.2, 4.3, 8.3.

export const USAGE = `Usage:
  sexton scan <repo-or-path> [--repo <url>] [--out <file>]
  sexton check [repo-or-path] [--repo <url>] [--summary <file>]
  sexton evidence [repo-or-path] [--repo <url>] [--out-dir <dir>]
  sexton evidence --verify <file>
  sexton --help
  sexton --version

A target that is a GitHub repository URL is scanned from GitHub. Any other target is a local directory.
Exit codes: 0 success, 1 the policy failed or the pack did not verify, 2 anything else.
`;

export const MSG = {
  unexpected: "sexton failed unexpectedly",
  cannotName: "cannot name the repository, pass --repo https://github.com/<owner>/<repo>",
  badRepoFlag: "--repo is not a public GitHub repository URL",
  repoFlagWithRepository: "--repo applies to a local directory target only",
  packageJsonMissing: "package.json was not found in the target directory",
  packageJsonTooLarge: "package.json is larger than 5 MiB",
  packageJsonInvalid: "package.json is not valid UTF-8",
  lockTooLarge: "package-lock.json is larger than 5 MiB",
  lockInvalid: "package-lock.json is not valid UTF-8",
  policyTooLarge: "sexton.policy.yml is larger than 256 KiB",
  policyInvalidText: "sexton.policy.yml is not valid UTF-8",
  policyFetchFailed: "sexton.policy.yml could not be fetched",
  policyInvalid: "sexton.policy.yml is not valid",
  verifyMismatch: "digest mismatch",
  notAPack: "not an evidence pack",
  verifyTooLarge: "the evidence file is larger than 16 MiB",
  verifyMissing: "the evidence file could not be read",
} as const;

export function usageError(reason: string): string {
  return `usage error: ${reason}. Run sexton --help.`;
}

export function couldNotWrite(file: string): string {
  return `could not write ${file}`;
}
