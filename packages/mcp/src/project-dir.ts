// The bounds on the projectDir argument. Spec: .kiro/specs/sexton-power, Requirement 2.2. Read-only file system calls only.
// Order: shape and absolute path, realpath, directory, package.json as a plain file. The caller uses only the real path.
import { isAbsolute, join } from "node:path";
import { MAX_PROJECT_DIR_CHARS } from "./schemas.js";

export interface PathStat {
  isDirectory(): boolean;
  isFile(): boolean;
}
/** The three read-only calls the check needs. Injected so tests use an in-memory tree. */
export interface ProjectFs {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<PathStat>;
  lstat(path: string): Promise<PathStat>;
}

export type ProjectDirCode = "project-dir-not-absolute" | "project-dir-not-found" | "project-dir-not-a-directory" | "package-json-missing";
export type ProjectDirOutcome = { readonly ok: true; readonly root: string } | { readonly ok: false; readonly code: ProjectDirCode };

export async function checkProjectDir(input: string, fs: ProjectFs): Promise<ProjectDirOutcome> {
  if (input.length < 1 || input.length > MAX_PROJECT_DIR_CHARS || input.includes("\u0000") || !isAbsolute(input)) {
    return { ok: false, code: "project-dir-not-absolute" };
  }
  let root: string;
  try {
    root = await fs.realpath(input);
  } catch {
    return { ok: false, code: "project-dir-not-found" };
  }
  try {
    if (!(await fs.stat(root)).isDirectory()) return { ok: false, code: "project-dir-not-a-directory" };
  } catch {
    return { ok: false, code: "project-dir-not-found" };
  }
  try {
    if (!(await fs.lstat(join(root, "package.json"))).isFile()) return { ok: false, code: "package-json-missing" };
  } catch {
    return { ok: false, code: "package-json-missing" };
  }
  return { ok: true, root };
}
