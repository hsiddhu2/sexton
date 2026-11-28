// Fakes for the CLI tests. No network: the transport answers from the engine's recorded fixtures.

import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { InMemoryFileSource, type Transport } from "@sexton/engine";
import type { CliDeps, FilePort, GitPort, ReadOutcome, TreeSource } from "../src/deps.js";
import { FIXTURES_DIR, fixtureRoutes, NOW, routedTransport } from "../../engine/test/helpers.js";

export interface Captured {
  readonly deps: CliDeps;
  readonly out: string[];
  readonly err: string[];
  readonly writes: Map<string, string>;
  readonly calls: { files: number; git: number; network: number };
}

export const ROOT = "/work/app";
export const fixturePackages = JSON.parse(readFileSync(posix.join(FIXTURES_DIR, "packages.json"), "utf8")) as { name: string; installedVersion: string }[];

export function fixtureTransport(): { transport: Transport; urls: string[] } {
  const { transport, calls } = routedTransport(fixturePackages.flatMap((p) => fixtureRoutes(p.name, p.installedVersion)));
  return { transport, urls: calls.map((c) => c.url) };
}

export function manifestsFor(packages: readonly { name: string; installedVersion: string }[], dev: readonly string[] = []): { pkg: string; lock: string } {
  const deps = Object.fromEntries(packages.filter((p) => !dev.includes(p.name)).map((p) => [p.name, p.installedVersion]));
  const devDeps = Object.fromEntries(packages.filter((p) => dev.includes(p.name)).map((p) => [p.name, p.installedVersion]));
  const pkg = JSON.stringify({ name: "app", version: "1.0.0", dependencies: deps, devDependencies: devDeps });
  const lock = JSON.stringify({
    name: "app",
    lockfileVersion: 3,
    packages: { "": { name: "app" }, ...Object.fromEntries(packages.map((p) => [`node_modules/${p.name}`, { version: p.installedVersion }])) },
  });
  return { pkg, lock };
}

export interface FakeOptions {
  readonly files?: Record<string, string>;
  readonly tree?: Record<string, string>;
  readonly origin?: string | null;
  readonly head?: string | null;
  readonly failWrites?: boolean;
  readonly transport?: Transport;
}

export function fakeDeps(options: FakeOptions = {}): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const writes = new Map<string, string>();
  const calls = { files: 0, git: 0, network: 0 };
  const store = new Map(Object.entries(options.files ?? {}));
  const read = (path: string, max: number): ReadOutcome => {
    calls.files += 1;
    const text = store.get(path) ?? writes.get(path);
    if (text === undefined) return { kind: "missing" };
    return new TextEncoder().encode(text).byteLength > max ? { kind: "too-large" } : { kind: "found", text: text.replace(new RegExp("^\ufeff"), "") };
  };
  const files: FilePort = {
    readRoot: (root, name, max) => Promise.resolve(read(posix.join(root, name), max)),
    readPath: (path, max) => Promise.resolve(read(path, max)),
    writeText: (path, text) => {
      calls.files += 1;
      if (options.failWrites === true) return Promise.resolve(false);
      writes.set(path, text);
      return Promise.resolve(true);
    },
  };
  const git: GitPort = {
    originUrl: () => {
      calls.git += 1;
      return Promise.resolve(options.origin === undefined ? "git@github.com:acme/app.git" : options.origin);
    },
    head: () => {
      calls.git += 1;
      return Promise.resolve(options.head ?? null);
    },
    lsFiles: () => Promise.resolve(null),
  };
  const base = options.transport ?? fixtureTransport().transport;
  const transport: Transport = (url, request) => {
    calls.network += 1;
    return base(url, request);
  };
  const workingTree = (): TreeSource => {
    const source = new InMemoryFileSource(options.tree ?? {});
    let listed = false;
    return {
      listFiles: async () => {
        listed = true;
        return source.listFiles();
      },
      readFile: (p) => source.readFile(p),
      counts: () => ({ performed: listed, rawCapped: false, skipped: 0, unread: 0 }),
    };
  };
  const deps: CliDeps = {
    transport,
    clock: () => NOW,
    stdout: { write: (t) => void out.push(t) },
    stderr: { write: (t) => void err.push(t) },
    files,
    git,
    env: {},
    cwd: ROOT,
    workingTree,
    resolvePath: (...parts) => posix.resolve(...parts),
  };
  return { deps, out, err, writes, calls };
}

/** A local app directory holding the fixture packages. */
export function appFiles(extra: Record<string, string> = {}, dev: readonly string[] = []): Record<string, string> {
  const { pkg, lock } = manifestsFor(fixturePackages, dev);
  return { [`${ROOT}/package.json`]: pkg, [`${ROOT}/package-lock.json`]: lock, ...extra };
}

export { NOW };
