// runScan: the composition behind GET /api/scan. Spec: .kiro/specs/infra, Requirements 4.1, 4.4, 4.6, 4.9 to 4.13, 6.5.
// Every dependency is injected. Never rejects. Logs one summary line with counts only, never the repository.

import {
  attachScan,
  CachedFetcher,
  DEFAULT_POLICY,
  evaluatePolicy,
  intakeRepo,
  parsePolicy,
  scanMetadata,
  scorePackages,
  type CacheStore,
  type ClientContext,
  type Policy,
  type PolicySource,
  type RetryOptions,
  type SnapshotStore,
  type Transport,
} from "@sexton/engine";
import type { ScanResponse } from "./contract.js";
import { intakeErrorSpec, internalErrorSpec, policyErrorSpec, policyFetchFailedSpec, type ErrorSpec } from "./http/responses.js";
import { errorName, type Logger } from "./log/logger.js";
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
}

export type ScanOutcome = { readonly ok: true; readonly body: ScanResponse } | { readonly ok: false; readonly response: ErrorSpec };

interface Summary {
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
  const retry = deps.retry !== undefined ? { retry: deps.retry } : {};
  const ctx: ClientContext = {
    transport: deps.transport,
    clock: deps.clock,
    cache: new CachedFetcher({ store: deps.cacheStore, clock: deps.clock, ttlMs: SCAN_CACHE_TTL_MS }),
    ...retry,
  };
  const intake = await (deps.intake ?? intakeRepo)(repoUrl, ctx);
  if (!intake.ok) return { ok: false, response: intakeErrorSpec(intake) };
  summary.packages = intake.packages.length;
  summary.capped = intake.capped;
  summary.unlocked = intake.unlocked;

  // The policy fetch and scoring share one cache store, so a key intake read is not fetched again (4.13).
  const [policyText, scored] = await Promise.all([
    fetchPolicyText(ctx, intake.repo),
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
  return { ok: true, body: { report, policy: evaluatePolicy(policy, report, source) } };
}
