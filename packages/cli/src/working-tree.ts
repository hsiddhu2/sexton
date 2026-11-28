// The working-tree File source for a local directory. Spec: .kiro/specs/cli-and-action, Requirement 5.
// Lists with git ls-files inside a work tree, else walks the directory. At most 20000 raw entries. Never lists or follows a
// symbolic link. Reads only listed paths whose real path is inside the real root, at most 256 KiB, valid UTF-8.

import { lstat, readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { IGNORED_DIRECTORIES, MAX_FILE_BYTES, UNREAD_SOURCE_DIRECTORIES } from "@sexton/engine";
import type { GitPort, TreeCounts, TreeSource } from "./deps.js";
import { nodeFilePort } from "./file-port.js";

export const MAX_RAW_ENTRIES = 20000;

async function walk(root: string): Promise<{ paths: string[]; capped: boolean; unread: number }> {
  const paths: string[] = [];
  let unread = 0;
  const pending: string[] = [""];
  while (pending.length > 0) {
    const dir = pending.shift() as string;
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.includes(entry.name)) pending.push(rel);
        else if (UNREAD_SOURCE_DIRECTORIES.includes(entry.name)) unread += 1;
      } else if (entry.isFile()) {
        if (paths.length >= MAX_RAW_ENTRIES) return { paths, capped: true, unread };
        paths.push(rel);
      }
    }
  }
  return { paths, capped: false, unread };
}

export function createWorkingTreeSource(root: string, git: GitPort): TreeSource {
  let performed = false;
  let rawCapped = false;
  let skipped = 0;
  let unread = 0;
  let listed = new Set<string>();
  let realRoot: string | null = null;

  return {
    async listFiles() {
      try {
        realRoot = await realpath(root);
        const fromGit = await git.lsFiles(realRoot, MAX_RAW_ENTRIES);
        let raw: string[];
        if (fromGit === null) {
          const walked = await walk(realRoot);
          raw = walked.paths;
          rawCapped = walked.capped;
          unread = walked.unread;
        } else {
          rawCapped = fromGit.length > MAX_RAW_ENTRIES;
          raw = fromGit.slice(0, MAX_RAW_ENTRIES);
        }
        const kept: string[] = [];
        const fromIndex = fromGit !== null;
        for (const rel of raw) {
          const path = rel.split(sep).join("/");
          if (path.startsWith("/") || path.split("/").some((s) => s === ".." || s === "." || s === "")) continue;
          try {
            // lstat: a symbolic link is not a file, so it is dropped, never followed.
            if ((await lstat(join(realRoot, path))).isFile()) kept.push(path);
          } catch {
            // A path git tracks but the disk lacks (a sparse or partial checkout) is skipped, so remove is not offered
            // on a tree Sexton could not read in full. A file vanished during a walk is simply dropped (decision 11).
            if (fromIndex) skipped += 1;
          }
        }
        listed = new Set(kept);
        performed = true;
        return kept;
      } catch {
        performed = false;
        return [];
      }
    },
    async readFile(path) {
      if (realRoot === null || typeof path !== "string" || !listed.has(path)) return undefined;
      try {
        const real = await realpath(join(realRoot, path));
        if (!real.startsWith(realRoot + sep)) {
          skipped += 1;
          return undefined;
        }
        const outcome = await nodeFilePort.readRoot(realRoot, path, MAX_FILE_BYTES);
        if (outcome.kind === "found") return outcome.text;
        skipped += 1;
        return undefined;
      } catch {
        skipped += 1;
        return undefined;
      }
    },
    counts(): TreeCounts {
      return { performed, rawCapped, skipped, unread };
    },
  };
}
