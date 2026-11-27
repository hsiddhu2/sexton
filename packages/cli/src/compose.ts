// The scan pipeline, modelled on the demo generator. Spec: .kiro/specs/cli-and-action, Requirements 2.5, 4, 6.1.
// intake, scorePackages, policy, import counting (local only), bumpTargets, gatherBumpData, gatherMigrationData,
// runMigrations, planRemediation, attachRemediations. One MemoryCacheStore; no snapshot store, so history signals say
// history is insufficient, which is correct and not an error.

import {
  attachRemediations,
  attachScan,
  bumpTargets,
  CachedFetcher,
  capFileSource,
  countReferences,
  DEFAULT_POLICY,
  evaluatePolicy,
  fetchPolicyText,
  gatherBumpData,
  gatherMigrationData,
  intakeFromManifests,
  intakeRepoWithManifests,
  isCountedPath,
  isUnreadSourcePath,
  MAX_MANIFEST_BYTES,
  MAX_POLICY_BYTES,
  mapWithConcurrency,
  MemoryCacheStore,
  parsePolicy,
  parseRepoUrl,
  planRemediation,
  readPackageScripts,
  runMigrations,
  scanMetadata,
  scorePackages,
  type ClientContext,
  type HealthReport,
  type IntakeManifests,
  type IntakePackage,
  type PolicyResult,
  type RemediationEntry,
  type RepoRef,
} from "@sexton/engine";
import type { CliDeps, ReadOutcome } from "./deps.js";
import { importSitesFor } from "./import-sites.js";
import { MSG } from "./messages.js";
import { repoFromRemote } from "./repo-name.js";
import { safe } from "./safe-text.js";

export const COUNT_LIMITS = { maxListed: 20000, maxRead: 5000 } as const;
const READ_CONCURRENCY = 16;

export type ResolvedTarget = { readonly kind: "repository"; readonly repo: RepoRef } | { readonly kind: "path"; readonly path: string; readonly repo: RepoRef };

export interface PipelineResult {
  readonly ok: true;
  readonly target: ResolvedTarget;
  readonly report: HealthReport;
  readonly policy: PolicyResult;
  readonly remediations: RemediationEntry[];
  readonly dependencies: readonly IntakePackage[];
  readonly manifests: IntakeManifests | null;
  readonly policyText: string | null;
}

/** Error lines for stderr, already Safe text. */
export interface PipelineError {
  readonly ok: false;
  readonly lines: readonly string[];
}

function err(...lines: string[]): PipelineError {
  return { ok: false, lines };
}

/** Names the target: a repository URL, or a directory named by --repo or by its origin remote. */
export async function resolveTarget(target: string | undefined, repoFlag: string | undefined, deps: CliDeps): Promise<ResolvedTarget | PipelineError> {
  const text = target ?? ".";
  const asRepo = parseRepoUrl(text);
  if (asRepo.ok) return repoFlag === undefined ? { kind: "repository", repo: asRepo.repo } : err(MSG.repoFlagWithRepository);
  const path = deps.resolvePath(deps.cwd, text);
  if (repoFlag !== undefined) {
    const flag = parseRepoUrl(repoFlag);
    return flag.ok ? { kind: "path", path, repo: flag.repo } : err(MSG.badRepoFlag);
  }
  const named = repoFromRemote(await deps.git.originUrl(path));
  return named === null ? err(MSG.cannotName) : { kind: "path", path, repo: named };
}

function readError(outcome: ReadOutcome, messages: { missing: string; tooLarge: string; invalid: string }): string | null {
  switch (outcome.kind) {
    case "found":
      return null;
    case "missing":
      return messages.missing;
    case "too-large":
      return messages.tooLarge;
    case "invalid":
      return messages.invalid;
  }
}

/** Counts references in the working tree with the Count limits. Entries only under the conditions of Requirement 2.5. */
async function importSites(path: string, intake: readonly IntakePackage[], scripts: ReadonlyMap<string, string>, deps: CliDeps): Promise<Map<string, number>> {
  const tree = deps.workingTree(path);
  // Spec remediation-remove-scope, bugfix 2.4, 2.5: an unread build, dist or coverage file or folder makes the listing incomplete.
  // The capped source drops Ignored directories, so the raw listing is counted on the way in.
  let unread = 0;
  const counted = {
    listFiles: async (): Promise<readonly string[]> => {
      const all = await tree.listFiles();
      unread = all.filter(isUnreadSourcePath).length;
      return all;
    },
    readFile: (p: string) => tree.readFile(p),
  };
  const capped = capFileSource(counted, COUNT_LIMITS);
  const listed = (await capped.source.listFiles()).filter(isCountedPath);
  const texts = await mapWithConcurrency(listed, READ_CONCURRENCY, async (p) => ({ path: p, text: await capped.source.readFile(p) }));
  const files = texts.flatMap((f) => (typeof f.text === "string" ? [{ path: f.path, text: f.text }] : []));
  const names = intake.filter((p) => p.origin === "dependencies").map((p) => p.name);
  const counts = countReferences(files, scripts, names);
  const c = capped.counts();
  const t = tree.counts();
  return importSitesFor(intake, counts, { performed: c.performed && t.performed, capped: c.capped || t.rawCapped, skipped: c.skipped + t.skipped + t.unread + unread });
}

export async function runScanPipeline(target: ResolvedTarget, deps: CliDeps): Promise<PipelineResult | PipelineError> {
  const store = new MemoryCacheStore();
  const ctx: ClientContext = { transport: deps.transport, clock: deps.clock, cache: new CachedFetcher({ store, clock: deps.clock }) };

  let intake;
  let policyText: string | null;
  if (target.kind === "path") {
    const pkg = await deps.files.readRoot(target.path, "package.json", MAX_MANIFEST_BYTES);
    const pkgError = readError(pkg, { missing: MSG.packageJsonMissing, tooLarge: MSG.packageJsonTooLarge, invalid: MSG.packageJsonInvalid });
    if (pkgError !== null || pkg.kind !== "found") return err(pkgError ?? MSG.packageJsonMissing);
    const lock = await deps.files.readRoot(target.path, "package-lock.json", MAX_MANIFEST_BYTES);
    if (lock.kind === "too-large") return err(MSG.lockTooLarge);
    if (lock.kind === "invalid") return err(MSG.lockInvalid);
    const policy = await deps.files.readRoot(target.path, "sexton.policy.yml", MAX_POLICY_BYTES);
    if (policy.kind === "too-large") return err(MSG.policyTooLarge);
    if (policy.kind === "invalid") return err(MSG.policyInvalidText);
    policyText = policy.kind === "found" ? policy.text : null;
    intake = await intakeFromManifests({ repo: target.repo, packageJsonText: pkg.text, packageLockText: lock.kind === "found" ? lock.text : null }, ctx);
  } else {
    intake = await intakeRepoWithManifests(target.repo.url, ctx);
    if (intake.result.ok) {
      const fetched = await fetchPolicyText(ctx, target.repo);
      if (fetched.kind === "failed") return err(MSG.policyFetchFailed);
      policyText = fetched.kind === "found" ? fetched.text : null;
    } else policyText = null;
  }
  if (!intake.result.ok) return err(safe(intake.result.message));
  const result = intake.result;

  let policy = DEFAULT_POLICY;
  if (policyText !== null) {
    const parsed = parsePolicy(policyText);
    if (!parsed.ok) return err(MSG.policyInvalid, ...parsed.errors.slice(0, 20).map((e) => `  ${safe(e.code, 40)} ${safe(e.path === "" ? "/" : e.path, 200)}`));
    policy = parsed.policy;
  }

  const scored = await scorePackages(result.packages, { transport: deps.transport, clock: deps.clock, cacheStore: store });
  const report = attachScan(scored, scanMetadata(result));
  const policyResult = evaluatePolicy(policy, report, policyText === null ? "default" : "file");

  const scripts = readPackageScripts(intake.manifests?.packageJson ?? "");
  const sites = target.kind === "path" ? await importSites(target.path, result.packages, scripts, deps) : new Map<string, number>();
  const options = { intake: result.packages, importSites: sites };
  const bumpData = await gatherBumpData(ctx, bumpTargets(report, options));
  const view = { packages: result.packages, scripts };
  const data = await gatherMigrationData(ctx, view);
  const files = target.kind === "path" ? deps.workingTree(target.path) : undefined;
  const migrations = await runMigrations(report, options, { packageJson: view, files, data });
  const plans = planRemediation(report, { ...options, bumpData, migrations });
  return {
    ok: true,
    target,
    report,
    policy: policyResult,
    remediations: attachRemediations(report, policyResult, plans),
    dependencies: result.packages,
    manifests: intake.manifests,
    policyText,
  };
}
