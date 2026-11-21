// Names the repository of a local directory from its origin remote. Spec: .kiro/specs/cli-and-action, Requirement 4.3. Pure.

import { parseRepoUrl, type RepoRef } from "@sexton/engine";

const SSH = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;

/** https and git@github.com: forms of a GitHub remote to a RepoRef; anything else null. Never invents a name. */
export function repoFromRemote(remote: string | null): RepoRef | null {
  if (remote === null) return null;
  const text = remote.trim();
  const ssh = SSH.exec(text);
  const url = ssh === null ? text : `https://github.com/${ssh[1] ?? ""}/${ssh[2] ?? ""}`;
  const parsed = parseRepoUrl(url);
  return parsed.ok ? parsed.repo : null;
}
