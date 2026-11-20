// intakeRepo: URL to direct dependencies with installed versions. Spec: .kiro/specs/repo-intake, Requirement 7.
// Returns a value for every outcome and never rejects. Every message is fixed text.

import { fetchManifest, type ManifestFile, type ManifestOutcome } from "../clients/github-raw.js";
import type { ClientContext } from "../clients/context.js";
import { readFullPackument } from "../clients/npm.js";
import { PACKAGE_CONCURRENCY, mapWithConcurrency } from "../score.js";
import type { IntakeError, IntakePackage, IntakeResult, ParsedDependency, RepoRef, Resolution } from "../types.js";
import { applyCap } from "./cap.js";
import { applyLockfile, parsePackageJson } from "./manifest.js";
import { isResolvableRange, resolveUnlocked, UNRESOLVED_VERSION } from "./resolve.js";
import { parseRepoUrl } from "./url.js";

export const INTERNAL_ERROR_MESSAGE = "Intake failed unexpectedly.";
export const MISSING_PACKAGE_JSON_MESSAGE = "package.json was not found. The repository may not exist or may be private.";

const INTERNAL_ERROR: IntakeError = { ok: false, code: "internal-error", message: INTERNAL_ERROR_MESSAGE };

/** Maps a non-found manifest outcome to an Intake error. Only the file name and an integer status reach the message. */
function manifestError(outcome: ManifestOutcome, file: ManifestFile): IntakeError {
  switch (outcome.kind) {
    case "not-found":
      return file === "package.json"
        ? { ok: false, code: "missing-package-json", message: MISSING_PACKAGE_JSON_MESSAGE, file }
        : INTERNAL_ERROR;
    case "too-large":
      return { ok: false, code: "manifest-too-large", message: `${file} is larger than 5 MiB.`, file };
    case "failed": {
      const status = outcome.status;
      const suffix = status !== null && Number.isInteger(status) ? ` (HTTP ${String(status)})` : "";
      return { ok: false, code: "fetch-failed", message: `${file} could not be fetched${suffix}.`, file };
    }
    case "found":
      return INTERNAL_ERROR;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolves one unlocked dependency. Never throws. Unresolvable ranges make no request. */
async function resolveOne(ctx: ClientContext, dependency: ParsedDependency): Promise<string> {
  try {
    if (!isResolvableRange(dependency.declaredRange)) return UNRESOLVED_VERSION;
    const packument = await readFullPackument(ctx, dependency.name);
    if (!isObject(packument)) return UNRESOLVED_VERSION;
    const versions = Object.hasOwn(packument, "versions") ? packument["versions"] : undefined;
    if (!isObject(versions)) return UNRESOLVED_VERSION;
    return resolveUnlocked(dependency.declaredRange, Object.keys(versions));
  } catch {
    return UNRESOLVED_VERSION;
  }
}

async function run(url: string, ctx: ClientContext): Promise<IntakeResult> {
  const parsedUrl = parseRepoUrl(url);
  if (!parsedUrl.ok) return parsedUrl;
  const repo: RepoRef = parsedUrl.repo;

  const pkgOutcome = await fetchManifest(ctx, repo, "package.json");
  if (pkgOutcome.kind !== "found") return manifestError(pkgOutcome, "package.json");

  const parsed = parsePackageJson(pkgOutcome.text);
  if (!parsed.ok) return parsed;

  const lockOutcome = await fetchManifest(ctx, repo, "package-lock.json");
  let lockText: string | null = null;
  if (lockOutcome.kind === "found") lockText = lockOutcome.text;
  else if (lockOutcome.kind !== "not-found") return manifestError(lockOutcome, "package-lock.json");

  const manifests = applyLockfile(parsed, lockText);
  if (!manifests.ok) return manifests;

  const capped = applyCap(manifests.dependencies);
  const installed = await mapWithConcurrency(capped.packages, PACKAGE_CONCURRENCY, (dependency) =>
    dependency.lockedVersion !== null ? Promise.resolve(dependency.lockedVersion) : resolveOne(ctx, dependency),
  );

  const packages: IntakePackage[] = capped.packages.map((dependency, index) => {
    const installedVersion = installed[index] ?? UNRESOLVED_VERSION;
    const resolution: Resolution =
      dependency.lockedVersion !== null ? "locked" : installedVersion === UNRESOLVED_VERSION ? "unresolved" : "unlocked";
    return {
      name: dependency.name,
      installedVersion,
      declaredRange: dependency.declaredRange,
      origin: dependency.origin,
      resolution,
    };
  });

  return {
    ok: true,
    repo,
    packages,
    unlocked: lockText === null,
    unlockedPackages: packages.filter((p) => p.resolution !== "locked").map((p) => p.name),
    lockfileVersion: manifests.lockfileVersion,
    capped: capped.capped,
    totalDirect: capped.totalDirect,
    skipped: manifests.skipped,
    unresolved: packages.filter((p) => p.resolution === "unresolved").map((p) => p.name),
  };
}

/** Never rejects. Any unexpected exception becomes internal-error. */
export async function intakeRepo(url: string, ctx: ClientContext): Promise<IntakeResult> {
  try {
    return await run(url, ctx);
  } catch {
    return INTERNAL_ERROR;
  }
}
