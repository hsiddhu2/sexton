// In-memory File source for tests and the demo. Spec: .kiro/specs/migration-node-sass, Requirement 1.1.
// The working-tree source (spec 09) and the GitHub source (spec 10b) implement the same port outside the planner.

import type { FileSource } from "../types.js";

export type { FileSource } from "../types.js";

export class InMemoryFileSource implements FileSource {
  readonly #files: ReadonlyMap<string, string>;

  constructor(files: ReadonlyMap<string, string> | Readonly<Record<string, string>>) {
    const copy = new Map<string, string>();
    const entries = files instanceof Map ? [...(files as ReadonlyMap<string, string>)] : Object.entries(files);
    for (const [path, text] of entries) copy.set(path, text);
    this.#files = copy;
  }

  listFiles(): Promise<readonly string[]> {
    return Promise.resolve([...this.#files.keys()]);
  }

  readFile(path: string): Promise<string | undefined> {
    return Promise.resolve(this.#files.get(path));
  }
}
