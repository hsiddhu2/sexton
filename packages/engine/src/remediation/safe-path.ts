// Path checks for repository files. Spec: .kiro/specs/migration-node-sass, Requirements 1.4, 2.7. Pure.

import { neutralise } from "./escape-field.js";

export const MAX_PATH_LENGTH = 400;
export const IGNORED_DIRECTORIES: readonly string[] = ["node_modules", ".git", "dist", "build", "coverage"];

/**
 * A relative path of 1 to 400 characters, "/" separated, no empty, "." or ".." segment, no backslash, and unchanged by
 * neutralise: no control, separator, bidi or direction-mark character and no lone surrogate.
 */
export function isSafePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  if (path.includes("\\") || neutralise(path) !== path) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** True when any segment is an Ignored directory. */
export function hasIgnoredSegment(path: string): boolean {
  return path.split("/").some((segment) => IGNORED_DIRECTORIES.includes(segment));
}
