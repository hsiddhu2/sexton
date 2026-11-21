// The real File port. Spec: .kiro/specs/cli-and-action, Requirements 4.1, 4.7, 8.3.
// Root files: a plain file only, never a symbolic link. Reads stop at maxBytes + 1 whatever stat said. Writes never
// follow a link (O_NOFOLLOW) and refuse anything but a regular file.

import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import type { FilePort, ReadOutcome } from "./deps.js";

const DECODER_OPTIONS = { fatal: true } as const;

async function readCapped(path: string, maxBytes: number, followLinks: boolean): Promise<ReadOutcome> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() && !followLinks) return { kind: "missing" };
  } catch {
    return { kind: "missing" };
  }
  let handle;
  try {
    handle = await open(path, followLinks ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return { kind: "missing" };
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { kind: "missing" };
    if (info.size > maxBytes) return { kind: "too-large" };
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) return { kind: "too-large" };
    }
    try {
      // TextDecoder strips a leading byte order mark (ignoreBOM false), as the hosted Transport does.
      return { kind: "found", text: new TextDecoder("utf-8", DECODER_OPTIONS).decode(buffer.subarray(0, total)) };
    } catch {
      return { kind: "invalid" };
    }
  } catch {
    return { kind: "missing" };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export const nodeFilePort: FilePort = {
  readRoot: (root, name, maxBytes) => readCapped(join(root, name), maxBytes, false),
  readPath: (path, maxBytes) => readCapped(path, maxBytes, true),
  async writeText(path, text) {
    try {
      // An existing entry must be a regular file: no link (O_NOFOLLOW below), no FIFO or device that could block.
      if (!(await lstat(path)).isFile()) return false;
    } catch {
      // Missing: created below.
    }
    let handle;
    try {
      handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
    } catch {
      return false;
    }
    try {
      if (!(await handle.stat()).isFile()) return false;
      await handle.writeFile(text, "utf8");
      return true;
    } catch {
      return false;
    } finally {
      await handle.close().catch(() => undefined);
    }
  },
};
