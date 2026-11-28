import type { PackageHealth, RemediationEntry, ScanResponse, State } from "@sexton/api";
import { SIGNAL_NAMES } from "../load/lists.js";
import { evidenceWords } from "../panel/pick-signals.js";
import { formatSignalValue } from "./format-value.js";

export const NOT_RECORDED = "not recorded";

export interface SignalRow {
  readonly name: string;
  readonly source: string;
  readonly fetchedAt: string;
  readonly available: boolean;
  readonly valueText: string | null;
  /** The value in plain words, as the Inspector writes it (spec clean-site, D2); null when unavailable. */
  readonly words: string | null;
  readonly reason: string | null;
}

export interface FailingRuleFailure {
  readonly reason: string;
  readonly source: string;
  readonly fetchedAt: string;
}

export interface FailingRuleRow {
  readonly index: number;
  readonly type: string;
  readonly name: string | null;
  readonly failures: readonly FailingRuleFailure[];
}

export interface DrawerModel {
  readonly title: string;
  readonly name: string;
  /** The installed version, or the Segment's version of a replay. */
  readonly version: string;
  /** The scan date, ISO (7.19). */
  readonly scanDate: string;
  readonly state: State;
  readonly stateReason: string;
  readonly signals: readonly SignalRow[];
  readonly missingSignals: readonly string[];
  readonly failingRules: readonly FailingRuleRow[];
  readonly remediation: RemediationEntry | null;
}

interface LooseEnvelope {
  readonly value?: unknown;
  readonly source?: unknown;
  readonly fetchedAt?: unknown;
  readonly available?: unknown;
  readonly reason?: unknown;
}

const text = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);

/** `version` replaces the installed version in the title (a versioned Segment, replay only). */
export function drawerModel(response: ScanResponse, pkg: PackageHealth, version?: string): DrawerModel {
  const signals: SignalRow[] = SIGNAL_NAMES.map((name) => {
    const env = pkg.signals[name] as unknown as LooseEnvelope;
    const available = env.available === true;
    return {
      name,
      source: text(env.source, NOT_RECORDED),
      fetchedAt: text(env.fetchedAt, NOT_RECORDED),
      available,
      valueText: available ? formatSignalValue(env.value) : null,
      words: available ? evidenceWords(name, env.value) : null,
      reason: available ? null : text(env.reason, NOT_RECORDED),
    };
  });

  const failingRules: FailingRuleRow[] = [];
  for (const rule of response.policy.rules) {
    const mine = rule.failures.filter((f) => f.name === pkg.name);
    if (mine.length === 0) continue;
    failingRules.push({
      index: rule.index,
      type: rule.type,
      name: typeof rule.name === "string" ? rule.name : null,
      failures: mine.map((f) => ({
        reason: f.reason,
        source: text(f.source, NOT_RECORDED),
        fetchedAt: text(f.fetchedAt, NOT_RECORDED),
      })),
    });
  }

  const remediation = response.remediations?.find((r) => r.packageName === pkg.name) ?? null;

  return {
    title: `${pkg.name} ${version ?? pkg.installedVersion}`,
    name: pkg.name,
    version: version ?? pkg.installedVersion,
    scanDate: response.report.generatedAt,
    state: pkg.state,
    stateReason: pkg.stateReason,
    signals,
    missingSignals: [...pkg.missingSignals],
    failingRules,
    remediation,
  };
}
