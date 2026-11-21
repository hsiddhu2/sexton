// The ports the CLI uses. Spec: .kiro/specs/cli-and-action, design "packages/cli". bin.ts builds the real ones; tests inject fakes.

import type { FileSource, Transport } from "@sexton/engine";

export interface Writer {
  write(text: string): void;
}

export type ReadOutcome =
  | { readonly kind: "found"; readonly text: string }
  | { readonly kind: "missing" }
  | { readonly kind: "too-large" }
  | { readonly kind: "invalid" };

export interface FilePort {
  /** Reads root/name: a plain file only (no symbolic link), at most maxBytes, UTF-8 fatal, byte order mark stripped. */
  readRoot(root: string, name: string, maxBytes: number): Promise<ReadOutcome>;
  /** Reads a file the user named, at most maxBytes, UTF-8 fatal. */
  readPath(path: string, maxBytes: number): Promise<ReadOutcome>;
  writeText(path: string, text: string): Promise<boolean>;
}

export interface GitPort {
  originUrl(path: string): Promise<string | null>;
  head(path: string): Promise<string | null>;
  /** git ls-files -z, or null outside a work tree or on any failure. At most limit + 1 entries. */
  lsFiles(path: string, limit: number): Promise<readonly string[] | null>;
}

export interface TreeCounts {
  readonly performed: boolean;
  readonly rawCapped: boolean;
  readonly skipped: number;
}

export interface TreeSource extends FileSource {
  counts(): TreeCounts;
}

export interface CliDeps {
  readonly transport: Transport;
  readonly clock: () => Date;
  readonly stdout: Writer;
  readonly stderr: Writer;
  readonly files: FilePort;
  readonly git: GitPort;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  /** A fresh working-tree source over a directory. */
  readonly workingTree: (root: string) => TreeSource;
  /** Joins and normalises paths; node:path in the real deps. */
  readonly resolvePath: (...parts: string[]) => string;
}
