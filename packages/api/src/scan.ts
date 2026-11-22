// runScan: the composition behind GET /api/scan. Spec: .kiro/specs/infra, Requirements 4.1, 4.4, 4.6, 4.9 to 4.13, 6.5,
// and .kiro/specs/hosted-plans, Requirements 5 and 6: token, head commit, intake and policy at that commit, scoring, plans.
// Every dependency is injected. Never rejects. Logs one summary line with counts only, never the repository.

import {
  attachScan,
  CachedFetcher,
  DEFAULT_POLICY,
  DEFAULT_RECIPE_REGISTRY,
  GithubFileSource,
  HEAD_REF,
  evaluatePolicy,
  intakeRepo,
  intakeRepoWithManifests,
  parsePolicy,
  parseRepoUrl,
  resolveHeadCommit,
  scanMetadata,
  scorePackages,
  type CacheStore,
  type ClientContext,
  type FileSource,
  type HealthReport,
  type IntakeManifests,
  type IntakePackage,
  type Policy,
  type PolicySource,
  type RemediationEntry,
  type RetryOptions,
  type SnapshotStore,
  type Transport,
} from "@sexton/engine";
import type { ScanResponse } from "./contract.js";
import { intakeErrorSpec, internalErrorSpec, policyErrorSpec, policyFetchFailedSpec, type ErrorSpec } from "./http/responses.js";
import { errorName, type Logger } from "./log/logger.js";
import { planStage } from "./plan-stage.js";
import { isAllowed } from "./remediate/allowlist.js";
import type { RemediationLogReader } from "./remediate/log-store.js";
import { fetchPolicyText } from "./policy-source.js";

export const SCAN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ScanDeps {
  /** Already wrapped with request logging. */
  readonly transport: Transport;
  readonly cacheStore: CacheStore;
  readonly snapshotStore: SnapshotStore;
  readonly clock: () => Date;
  readonly log: Logger;
  readonly retry?: RetryOptions;
  /** Injectable for tests. Defaults to the engine's intakeRepo. */
  readonly intake?: typeof intakeRepo;
  /** The GitHub token provider. Absent means no token, so no api.github.com call (hosted-plans, Requirement 5.1). */
  readonly githubToken?: () => Promise<string | null>;
  /** The remediate allowlist; absent allows nothing (spec remediate, Requirement 7.2). */
  readonly allowlist?: ReadonlySet<string>;
  /** The remediation log, read by the evidence path only (spec remediate, Requirement 7.1). */
  readonly remediationLog?: RemediationLogReader;
}

export type ScanOutcome = { readonly ok: true; readonly body: ScanResponse } | { readonly ok: false; readonly response: ErrorSpec };

/** The scan body plus what the evidence pack needs. Spec evidence-pack, Requirement 7.3. Internal to the API. */
export type ScanWithInputs =
  | {
      readonly ok: true;
      readonly body: ScanResponse;
      readonly dependencies: readonly IntakePackage[];
      /** Null when an injected intake ran, so the texts are unknown. */
      readonly manifests: IntakeManifests | null;
      /** The policy file text, null for the default policy. */
      readonly policyText: string | null;
      /** The commit the manifests and the policy were read at, null when they were read at HEAD (hosted-plans, 5.5). */
      readonly commit: string | null;
    }
  | { readonly ok: false; readonly response: ErrorSpec };

export interface Summary {
  status: number;
  packages: number;
  capped: boolean;
  unlocked: boolean;
  policySource: PolicySource | "none";
}

export async function runScan(repoUrl: string, deps: ScanDeps): Promise<ScanOutcome> {
  const started = Date.now();
  const summary: Summary = { status: 500, packages: 0, capped: false, unlocked: false, policySource: "none" };
  let outcome: ScanOutcome;
  try {
    outcome = await scan(repoUrl, deps, summary);
  } catch (error) {
    deps.log.error({ msg: "scan-failed", errorName: errorName(error) });
    outcome = { ok: false, response: internalErrorSpec() };
  }
  summary.status = outcome.ok ? 200 : outcome.response.status;
  try {
    deps.log.info({ msg: "scan", ...summary, durationMs: Math.max(0, Date.now() - started) });
  } catch {
    // Logging must never fail a scan.
  }
  return outcome;
}

async function scan(repoUrl: string, deps: ScanDeps, summary: Summary): Promise<ScanOutcome> {
  const outcome = await scanWithInputs(repoUrl, deps, summary);
  return outcome.ok ? { ok: true, body: outcome.body } : outcome;
}

/** The scan, keeping the intake packages, manifest texts and policy text. Never hashes: only the evidence path does. */
async function tokenOrNull(deps: ScanDeps): Promise<string | null> {
  try {
    return deps.githubToken === undefined ? null : await deps.githubToken();
  } catch {
    return null;
  }
}

/** True when some Unhealthy package has a recipe, so a recipe will ask for files. */
function needsFiles(report: HealthReport): boolean {
  return report.packages.some((p) => (p.state === "Haunted" || p.state === "Dead" || p.state === "Possessed") && DEFAULT_RECIPE_REGISTRY.has(p.name));
}

export async function scanWithInputs(repoUrl: string, deps: ScanDeps, summary: Summary): Promise<ScanWithInputs> {
  const retry = deps.retry !== undefined ? { retry: deps.retry } : {};
  const ctx: ClientContext = {
    transport: deps.transport,
    clock: deps.clock,
    cache: new CachedFetcher({ store: deps.cacheStore, clock: deps.clock, ttlMs: SCAN_CACHE_TTL_MS }),
    ...retry,
  };

  // Head commit only with a token: without one no api.github.com call is made (Requirements 5.1 to 5.4).
  const token = await tokenOrNull(deps);
  const parsedUrl = parseRepoUrl(repoUrl);
  let commit: string | null = null;
  if (token !== null && parsedUrl.ok) {
    const head = await resolveHeadCommit(ctx, parsedUrl.repo, { token });
    if (head.ok) commit = head.sha;
    else deps.log.warn({ msg: "github-api-unavailable", status: head.status ?? 0 });
  }
  const ref = commit ?? HEAD_REF;

  const { result: intake, manifests } =
    deps.intake !== undefined ? { result: await deps.intake(repoUrl, ctx), manifests: null } : await intakeRepoWithManifests(repoUrl, ctx, ref);
  if (!intake.ok) return { ok: false, response: intakeErrorSpec(intake) };
  summary.packages = intake.packages.length;
  summary.capped = intake.capped;
  summary.unlocked = intake.unlocked;

  // The policy fetch and scoring share one cache store, so a key intake read is not fetched again (4.13).
  const [policyText, scored] = await Promise.all([
    fetchPolicyText(ctx, intake.repo, ref),
    scorePackages(intake.packages, {
      transport: deps.transport,
      clock: deps.clock,
      cacheStore: deps.cacheStore,
      cacheTtlMs: SCAN_CACHE_TTL_MS,
      snapshotStore: deps.snapshotStore,
      ...retry,
    }),
  ]);

  let policy: Policy;
  let source: PolicySource;
  if (policyText.kind === "failed") return { ok: false, response: policyFetchFailedSpec() };
  if (policyText.kind === "absent") {
    policy = DEFAULT_POLICY;
    source = "default";
  } else {
    const parsed = parsePolicy(policyText.text);
    if (!parsed.ok) return { ok: false, response: policyErrorSpec(parsed.errors) };
    policy = parsed.policy;
    source = "file";
  }
  summary.policySource = source;
  const report = attachScan(scored, scanMetadata(intake));
  const policyResult = evaluatePolicy(policy, report, source);

  // Plans (Requirement 6). Files only with a known commit, a token and a recipe that needs them (6.5).
  // planStage never rejects; the outer guard keeps any surprise from reaching runScan's 500 path (6.6).
  const files = (): FileSource | undefined =>
    commit !== null && token !== null && needsFiles(report) ? new GithubFileSource(ctx, intake.repo, commit, { token }) : undefined;
  let planned: { readonly remediations: RemediationEntry[]; readonly partial: boolean };
  try {
    planned = await planStage({ ctx, report, policy: policyResult, intake: intake.packages, packageJsonText: manifests?.packageJson ?? "", files });
  } catch {
    planned = { remediations: [], partial: true };
  }
  if (planned.partial) deps.log.warn({ msg: "plans-partial" });

  return {
    ok: true,
    body: {
      report,
      policy: policyResult,
      remediations: planned.remediations,
      actions: { remediate: deps.allowlist !== undefined && isAllowed(deps.allowlist, intake.repo) },
    },
    dependencies: intake.packages,
    manifests,
    policyText: policyText.kind === "found" ? policyText.text : null,
    commit,
  };
}
