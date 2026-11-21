// The real Git port. Spec: .kiro/specs/cli-and-action, Requirement 4.4, design decision 7.
// Three fixed commands through execFile: no shell, the path is an argument, 5 second timeout, any failure null.
// core.fsmonitor=false on the command line beats any .git/config in the checkout, so git runs no command from it.

import { execFile } from "node:child_process";
import type { GitPort } from "./deps.js";

const TIMEOUT_MS = 5000;
const MAX_BUFFER = 64 * 1024 * 1024;

function git(path: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        "git",
        ["-c", "core.fsmonitor=false", "-C", path, ...args],
        { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, shell: false, windowsHide: true, encoding: "utf8" },
        (error, stdout) => {
          resolve(error === null && typeof stdout === "string" ? stdout : null);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

export const nodeGitPort: GitPort = {
  async originUrl(path) {
    const out = await git(path, ["remote", "get-url", "origin"]);
    return out === null ? null : out.trim();
  },
  async head(path) {
    const out = await git(path, ["rev-parse", "HEAD"]);
    return out === null ? null : out.trim();
  },
  async lsFiles(path, limit) {
    const out = await git(path, ["ls-files", "-z"]);
    if (out === null) return null;
    return out.split("\0").filter((p) => p.length > 0).slice(0, limit + 1);
  },
};
