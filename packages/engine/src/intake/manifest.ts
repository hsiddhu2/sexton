// Pure parsers for package.json and package-lock.json. Spec: .kiro/specs/repo-intake, Requirements 3, 4, 8.
// JSON.parse with no reviver is the only parser. Every read of an untrusted map is an own-property read.

import semver from "semver";
import { isValidPackageName } from "./names.js";
import type {
  DependencyOrigin,
  LockfileVersion,
  ManifestParseError,
  ManifestsParse,
  PackageJsonOk,
  PackageJsonParse,
  ParsedDependency,
} from "../types.js";

export const INVALID_PACKAGE_JSON_MESSAGE = "package.json is not a valid manifest.";
export const INVALID_LOCKFILE_MESSAGE = "package-lock.json is not a valid lockfile.";

const PACKAGE_JSON_ERROR: ManifestParseError = {
  ok: false,
  code: "invalid-package-json",
  message: INVALID_PACKAGE_JSON_MESSAGE,
  file: "package.json",
};

const LOCKFILE_ERROR: ManifestParseError = {
  ok: false,
  code: "invalid-lockfile",
  message: INVALID_LOCKFILE_MESSAGE,
  file: "package-lock.json",
};

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(map: PlainObject, key: string): unknown {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

function ownRecord(map: PlainObject | undefined, key: string): PlainObject | undefined {
  if (map === undefined) return undefined;
  const value = own(map, key);
  return isPlainObject(value) ? value : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Reads a dependency map: absent is empty, anything but an object of strings is null. */
function readStringMap(root: PlainObject, key: string): Map<string, string> | null {
  const result = new Map<string, string>();
  if (!Object.hasOwn(root, key)) return result;
  const value = own(root, key);
  if (!isPlainObject(value)) return null;
  for (const name of Object.keys(value)) {
    const range = own(value, name);
    if (typeof range !== "string") return null;
    result.set(name, range);
  }
  return result;
}

/** Counts distinct valid names in a peer or optional map that are not direct. Not an object counts zero. */
function countSkipped(root: PlainObject, key: string, direct: ReadonlySet<string>): number {
  const value = own(root, key);
  if (!isPlainObject(value)) return 0;
  let count = 0;
  for (const name of Object.keys(value)) {
    if (isValidPackageName(name) && !direct.has(name)) count += 1;
  }
  return count;
}

function sortedValidNames(map: ReadonlyMap<string, string>, exclude?: ReadonlyMap<string, string>): string[] {
  const names: string[] = [];
  for (const name of map.keys()) {
    if (isValidPackageName(name) && !(exclude?.has(name) ?? false)) names.push(name);
  }
  return names.sort(compareCodeUnits);
}

export function parsePackageJson(text: string): PackageJsonParse {
  try {
    const root = parseJson(text);
    if (!isPlainObject(root)) return PACKAGE_JSON_ERROR;
    const deps = readStringMap(root, "dependencies");
    const devDeps = readStringMap(root, "devDependencies");
    if (deps === null || devDeps === null) return PACKAGE_JSON_ERROR;

    const dependencies: ParsedDependency[] = [];
    const add = (name: string, map: ReadonlyMap<string, string>, origin: DependencyOrigin): void => {
      dependencies.push({ name, declaredRange: map.get(name) ?? "", origin, lockedVersion: null });
    };
    for (const name of sortedValidNames(deps)) add(name, deps, "dependencies");
    for (const name of sortedValidNames(devDeps, deps)) add(name, devDeps, "devDependencies");

    const allKeys = new Set<string>([...deps.keys(), ...devDeps.keys()]);
    let invalidName = 0;
    for (const key of allKeys) {
      if (!isValidPackageName(key)) invalidName += 1;
    }
    const direct = new Set(dependencies.map((d) => d.name));
    const ok: PackageJsonOk = {
      ok: true,
      dependencies,
      totalDirect: dependencies.length,
      skipped: {
        peer: countSkipped(root, "peerDependencies", direct),
        optional: countSkipped(root, "optionalDependencies", direct),
        invalidName,
      },
    };
    return ok;
  } catch {
    return PACKAGE_JSON_ERROR;
  }
}

function lockfileVersionOf(value: unknown): LockfileVersion | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function lockedVersion(root: PlainObject, version: LockfileVersion, name: string): string | null {
  const entry =
    version === 1
      ? ownRecord(ownRecord(root, "dependencies"), name)
      : ownRecord(ownRecord(root, "packages"), `node_modules/${name}`);
  if (entry === undefined) return null;
  const v = own(entry, "version");
  return typeof v === "string" && semver.valid(v) === v ? v : null;
}

export function applyLockfile(parsed: PackageJsonOk, lockfileText: string | null): ManifestsParse {
  try {
    if (lockfileText === null) {
      return {
        ok: true,
        dependencies: parsed.dependencies,
        totalDirect: parsed.totalDirect,
        skipped: parsed.skipped,
        lockfileVersion: null,
        unlocked: true,
        unlockedPackages: parsed.dependencies.map((d) => d.name),
      };
    }
    const root = parseJson(lockfileText);
    if (!isPlainObject(root)) return LOCKFILE_ERROR;
    const version = lockfileVersionOf(own(root, "lockfileVersion"));
    if (version === null) return LOCKFILE_ERROR;

    const dependencies = parsed.dependencies.map(
      (d): ParsedDependency => ({ ...d, lockedVersion: lockedVersion(root, version, d.name) }),
    );
    return {
      ok: true,
      dependencies,
      totalDirect: parsed.totalDirect,
      skipped: parsed.skipped,
      lockfileVersion: version,
      unlocked: false,
      unlockedPackages: dependencies.filter((d) => d.lockedVersion === null).map((d) => d.name),
    };
  } catch {
    return LOCKFILE_ERROR;
  }
}

export function parseManifests(packageJsonText: string, lockfileText: string | null): ManifestsParse {
  const parsed = parsePackageJson(packageJsonText);
  if (!parsed.ok) return parsed;
  return applyLockfile(parsed, lockfileText);
}
