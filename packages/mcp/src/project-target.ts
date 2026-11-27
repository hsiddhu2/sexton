// Names the scan target of a Project root. Spec: .kiro/specs/sexton-power, Requirements 2.8, 2.9.
// A GitHub origin names the repository as the CLI does. Without one, a placeholder keeps the pipeline running; it never appears in a result.
import { basename } from "node:path";
import { repoFromRemote, type CliDeps, type ResolvedTarget } from "@sexton/cli";

const MAX_NAME = 100;

/** The directory name with every character outside [A-Za-z0-9._-] replaced by "-", cut to 100, never empty. */
export function placeholderName(root: string): string {
  const raw = Array.from(basename(root)).slice(0, MAX_NAME).map((c) => (/^[A-Za-z0-9._-]$/.test(c) ? c : "-")).join("");
  return raw === "" || raw === "." || raw === ".." ? "project" : raw;
}

export async function projectTarget(root: string, deps: Pick<CliDeps, "git">): Promise<ResolvedTarget> {
  const named = repoFromRemote(await deps.git.originUrl(root));
  if (named !== null) return { kind: "path", path: root, repo: named };
  const repo = placeholderName(root);
  return { kind: "path", path: root, repo: { owner: "local", repo, url: `https://github.com/local/${repo}` } };
}
