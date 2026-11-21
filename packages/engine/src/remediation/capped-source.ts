// The Capped source the recipe runner hands to a recipe. Spec: .kiro/specs/migration-node-sass, Requirement 1.
// Caps live here, not in the sources, so they hold whichever source a caller passes.

import type { FileSource, ScanCounts } from "../types.js";
import { hasIgnoredSegment, isSafePath } from "./safe-path.js";

export const MAX_LISTED = 500;
export const MAX_READ = 200;
export const MAX_FILE_BYTES = 262144;

/** UTF-8 length counted from code units, without allocating. A lone surrogate counts 3, as U+FFFD would. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Caps for one wrapper. Defaults are the recipe caps; import counting passes larger ones (spec cli-and-action, 1.5). */
export interface CapLimits {
  readonly maxListed: number;
  readonly maxRead: number;
  readonly maxFileBytes: number;
}

export interface CappedSource {
  readonly source: FileSource;
  counts(): ScanCounts;
}

/** Wraps a File source with the Caps. Never rejects. */
export function capFileSource(inner: FileSource, limits: Partial<CapLimits> = {}): CappedSource {
  const maxListed = limits.maxListed ?? MAX_LISTED;
  const maxRead = limits.maxRead ?? MAX_READ;
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES;
  let listed: string[] = [];
  let listFailed = false;
  let skipped = 0;
  let read = 0;
  let capped = false;
  let listing: Promise<readonly string[]> | undefined;
  const answers = new Map<string, Promise<string | undefined>>();

  const list = async (): Promise<readonly string[]> => {
    let raw: unknown;
    try {
      raw = await inner.listFiles();
    } catch {
      raw = undefined;
    }
    if (!Array.isArray(raw)) {
      listFailed = true;
      return listed;
    }
    const kept = new Set<string>();
    for (const path of raw as unknown[]) {
      if (!isSafePath(path)) {
        skipped += 1;
        continue;
      }
      if (!hasIgnoredSegment(path)) kept.add(path);
    }
    const sorted = [...kept].sort(byCodeUnits);
    if (sorted.length > maxListed) capped = true;
    listed = sorted.slice(0, maxListed);
    return [...listed];
  };

  const readOnce = async (path: string): Promise<string | undefined> => {
    let text: unknown;
    try {
      text = await inner.readFile(path);
    } catch {
      text = undefined;
    }
    if (typeof text !== "string" || utf8Length(text) > maxFileBytes) {
      skipped += 1;
      return undefined;
    }
    return text;
  };

  const source: FileSource = {
    listFiles(): Promise<readonly string[]> {
      listing ??= list();
      return listing.then((paths) => [...paths]);
    },
    readFile(path: string): Promise<string | undefined> {
      if (typeof path !== "string" || !listed.includes(path)) return Promise.resolve(undefined);
      const earlier = answers.get(path);
      if (earlier !== undefined) return earlier;
      if (read >= maxRead) {
        capped = true;
        return Promise.resolve(undefined);
      }
      read += 1;
      const answer = readOnce(path);
      answers.set(path, answer);
      return answer;
    },
  };

  return {
    source,
    counts: () => ({ performed: listing !== undefined && !listFailed, listed: listed.length, read, skipped, capped }),
  };
}
