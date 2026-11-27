// A file port that can read and cannot write. Spec: .kiro/specs/sexton-power, Requirements 7.1, 7.7.
import type { FilePort } from "@sexton/cli";

/** The reads of `inner`, and a writeText that throws. The scan pipeline never writes; a test asserts it. */
export function readOnlyFiles(inner: FilePort): FilePort {
  return {
    readRoot: (root, name, maxBytes) => inner.readRoot(root, name, maxBytes),
    readPath: (path, maxBytes) => inner.readPath(path, maxBytes),
    writeText: () => {
      throw new Error("write attempted");
    },
  };
}
