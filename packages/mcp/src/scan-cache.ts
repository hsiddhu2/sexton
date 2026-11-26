// One scan per project root and manifests digest, shared while it runs. Spec: .kiro/specs/sexton-power, Requirements 9.3 to 9.5.
import { createHash } from "node:crypto";
import { runScanPipeline, type CliDeps, type PipelineError, type PipelineResult } from "@sexton/cli";
import { projectTarget } from "./project-target.js";

export type ScanOutcome =
  | { readonly kind: "ready"; readonly result: PipelineResult }
  | { readonly kind: "failed"; readonly error: PipelineError }
  | { readonly kind: "timeout" };

export interface ScanCacheOptions {
  readonly deps: CliDeps;
  /** A scan still running after this many ms answers "timeout" and keeps running. 55 000 in the server. */
  readonly timeoutMs: number;
  /** A finished scan is kept this long. 900 000 (15 minutes) in the server. */
  readonly ttlMs: number;
  /** Milliseconds; the injected clock of the tests. */
  readonly now: () => number;
}

interface Entry {
  readonly promise: Promise<ScanOutcome>;
  finishedAt: number | null;
}

const MANIFESTS = [
  ["package.json", 5 * 1024 * 1024],
  ["package-lock.json", 5 * 1024 * 1024],
  ["sexton.policy.yml", 256 * 1024],
] as const;
const MAX_ENTRIES = 20;

export class ScanCache {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly options: ScanCacheOptions) {}

  async get(root: string): Promise<ScanOutcome> {
    const key = await this.keyFor(root);
    this.purge();
    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = this.start(key, root);
      this.entries.set(key, entry);
    }
    return this.race(entry.promise);
  }

  /** root plus a SHA-256 over the length-prefixed contents of the three manifests; a missing or unreadable file hashes as a marker. */
  private async keyFor(root: string): Promise<string> {
    const hash = createHash("sha256");
    for (const [name, max] of MANIFESTS) {
      const outcome = await this.options.deps.files.readRoot(root, name, max);
      const body = outcome.kind === "found" ? `found:${outcome.text}` : outcome.kind;
      hash.update(`${String(Buffer.byteLength(body, "utf8"))}:${body}`);
    }
    return `${root}\n${hash.digest("hex")}`;
  }

  private start(key: string, root: string): Entry {
    const { deps, now } = this.options;
    const entry: Entry = {
      finishedAt: null,
      promise: (async (): Promise<ScanOutcome> => {
        const target = await projectTarget(root, deps);
        const scan = await runScanPipeline(target, deps);
        return scan.ok ? { kind: "ready", result: scan } : { kind: "failed", error: scan };
      })().then(
        (outcome) => {
          entry.finishedAt = now();
          return outcome;
        },
        (error: unknown) => {
          this.entries.delete(key);
          throw error;
        },
      ),
    };
    return entry;
  }

  private purge(): void {
    const t = this.options.now();
    for (const [key, entry] of this.entries) {
      if (entry.finishedAt !== null && t - entry.finishedAt >= this.options.ttlMs) this.entries.delete(key);
    }
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  private race(promise: Promise<ScanOutcome>): Promise<ScanOutcome> {
    return new Promise<ScanOutcome>((resolve, reject) => {
      const timer = setTimeout(() => resolve({ kind: "timeout" }), this.options.timeoutMs);
      promise.then(
        (outcome) => {
          clearTimeout(timer);
          resolve(outcome);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error("scan failed"));
        },
      );
    });
  }
}
