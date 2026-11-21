// The Markdown report, rendered from the pack and nothing else. Spec: .kiro/specs/evidence-pack, Requirement 5.
// Every string from the pack is untrusted and goes through escapeField (escape, then truncate). Sync and pure.

import { escapeField } from "../remediation/escape-field.js";
import { SIGNAL_NAMES, STATE_ORDER, type EvidencePack, type PackageHealth, type Signal, type SignalName } from "../types.js";
import { SIGNAL_SUMMARIES } from "./signal-summary.js";

export const DIGEST_LIMIT_SENTENCE = "This digest shows an edit only to a reviewer who got it from somewhere else. It is not a signature.";
/** Design decision 4: the jq command with its one reachable limit, and the exact check. */
export const VERIFY_TEXT =
  "To check it, run `jq -cjS .body <evidence JSON file> | shasum -a 256` and compare the result with the digest above. " +
  "The command matches RFC 8785 for this pack unless a string in it holds the character U+007F; verifyEvidencePack in the Sexton engine is exact.";
export const FOOTER = "The JSON file is the record. This report is rendered from it. Long values are shortened here.";
export const LOG_NOT_CONNECTED = "remediation log not connected in this deployment";
export const LOG_EMPTY = "no pull requests recorded";
export const MAX_ADVISORIES_SHOWN = 20;

const F = escapeField;

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.map(F).join(", ");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rank(state: string): number {
  const i = (STATE_ORDER as readonly string[]).indexOf(state);
  return i === -1 ? STATE_ORDER.length : i;
}

function signalRow(name: SignalName, signal: Signal<unknown>): string {
  const value = signal.available
    ? (SIGNAL_SUMMARIES[name] as (v: unknown) => string)(signal.value)
    : `unavailable: ${F(signal.reason)}`;
  return `| ${name} | ${value} | ${F(signal.source)} | ${F(signal.fetchedAt)} |`;
}

function signalsSection(pkg: PackageHealth): string[] {
  const lines = [`### ${F(pkg.name)} ${F(pkg.installedVersion)}`, "", "| Signal | Value | Source | Fetched at |", "|---|---|---|---|"];
  for (const name of SIGNAL_NAMES) lines.push(signalRow(name, pkg.signals[name] as Signal<unknown>));
  const advisories = pkg.signals.advisories;
  if (advisories.available && advisories.value.length > 0) {
    lines.push("", "Advisories:");
    for (const a of advisories.value.slice(0, MAX_ADVISORIES_SHOWN)) lines.push(`- ${F(a.id)} ${F(a.severity)}: ${F(a.summary)}`);
    if (advisories.value.length > MAX_ADVISORIES_SHOWN) {
      lines.push(`and ${String(advisories.value.length - MAX_ADVISORIES_SHOWN)} more in the JSON`);
    }
  }
  lines.push("");
  return lines;
}

/** Renders the report. Sections: title, Integrity, Scan, Policy, Packages, Signals, SBOM, Remediation, footer. */
export function renderEvidenceMarkdown(pack: EvidencePack): string {
  const { body, integrity } = pack;
  const { scan, sbom, policy, remediation } = body;
  const out: string[] = [];

  out.push(`# Sexton evidence pack: ${F(scan.repository)}`, "");

  out.push("## Integrity", "");
  out.push(`- Digest: ${F(integrity.digest)}`);
  out.push(`- Algorithm: ${F(integrity.algorithm)} over the ${F(integrity.canonicalization)} canonical form of \`body\`, UTF-8 encoded`);
  out.push("", DIGEST_LIMIT_SENTENCE, "", VERIFY_TEXT, "");

  out.push("## Scan", "");
  out.push(`- Repository: ${F(scan.repository)}`);
  out.push(`- Commit: ${scan.commit === null ? `not recorded (${F(scan.commitNote ?? "")})` : F(scan.commit)}`);
  out.push(`- Generated at: ${F(scan.generatedAt)}`);
  out.push(`- Engine version: ${F(scan.engineVersion)}`);
  out.push(`- Policy: version ${String(scan.policy.version)}, source ${F(scan.policy.source)}, digest ${scan.policy.digest === null ? "none" : F(scan.policy.digest)}`);
  out.push(`- package.json digest: ${scan.manifests.packageJson === null ? "not recorded" : F(scan.manifests.packageJson)}`);
  out.push(`- package-lock.json digest: ${scan.manifests.packageLock === null ? "not recorded" : F(scan.manifests.packageLock)}`);
  out.push(`- Lockfile version: ${scan.lockfileVersion === null ? "none" : String(scan.lockfileVersion)}`);
  out.push(`- Unlocked: ${yesNo(scan.unlocked)}`);
  out.push(`- Capped: ${yesNo(scan.capped)}`);
  out.push(`- Direct dependencies: ${String(scan.totalDirect)}`);
  out.push(`- Skipped: peer ${String(scan.skipped.peer)}, optional ${String(scan.skipped.optional)}, invalid name ${String(scan.skipped.invalidName)}`);
  out.push(`- Unresolved: ${list(scan.unresolved)}`);
  out.push(`- Unlocked packages: ${list(scan.unlockedPackages)}`, "");

  out.push("## Policy", "");
  out.push(`Result: **${policy.pass ? "pass" : "fail"}**, source ${F(policy.source)}`, "");
  for (const rule of policy.rules) {
    out.push(`### Rule ${String(rule.index)}: ${F(rule.type)}${rule.name === undefined ? "" : ` ${F(rule.name)}`}`, "");
    out.push(`Result: ${rule.pass ? "pass" : "fail"}`);
    if (rule.failures.length > 0) {
      out.push("", "Failures:");
      for (const f of rule.failures) out.push(`- ${F(f.name)} ${F(f.installedVersion)}: ${F(f.reason)}`);
    }
    if (rule.unevaluated.length > 0) {
      out.push("", "Not evaluated:");
      for (const u of rule.unevaluated) out.push(`- ${F(u.name)} ${F(u.installedVersion)}: ${F(u.reason)}`);
    }
    if (rule.notFound.length > 0) {
      out.push("", "Not found:");
      for (const n of rule.notFound) out.push(`- ${F(n)}`);
    }
    out.push("");
  }

  const ordered = [...body.packages].sort((a, b) => rank(a.state) - rank(b.state) || compare(a.name, b.name));
  out.push("## Packages", "", "| Package | Version | State | Reason |", "|---|---|---|---|");
  for (const p of ordered) out.push(`| ${F(p.name)} | ${F(p.installedVersion)} | ${F(p.state)} | ${F(p.stateReason)} |`);
  out.push("");

  out.push("## Signals", "");
  for (const p of ordered) out.push(...signalsSection(p));

  out.push("## SBOM", "");
  out.push(`- Spec version: ${F(sbom.specVersion)}`);
  out.push(`- Serial number: ${F(sbom.serialNumber)}`);
  out.push(`- Components: ${String(sbom.components.length)}`, "");
  for (const c of sbom.components) out.push(`- ${F(c.purl ?? c.name)}`);
  out.push("");

  out.push("## Remediation", "", "### Plans", "");
  if (remediation.plans.length === 0) out.push("no plans");
  else {
    out.push("| Package | Kind | Status | Title | Version | Major |", "|---|---|---|---|---|---|");
    for (const p of remediation.plans) {
      const major = p.majorUpgrade === undefined ? "" : yesNo(p.majorUpgrade);
      out.push(`| ${F(p.packageName)} | ${F(p.kind)} | ${F(p.status)} | ${F(p.title)} | ${p.chosenVersion === undefined ? "" : F(p.chosenVersion)} | ${major} |`);
    }
  }
  out.push("", "### Log", "");
  if (!remediation.log.available) out.push(LOG_NOT_CONNECTED);
  else if (remediation.log.entries.length === 0) out.push(LOG_EMPTY);
  else {
    out.push("| Repository | Branch | Package | Kind | Pull request | Time |", "|---|---|---|---|---|---|");
    for (const e of remediation.log.entries) {
      out.push(`| ${F(e.repository)} | ${F(e.branch)} | ${F(e.package)} | ${F(e.kind)} | ${F(e.prUrl)} | ${F(e.timestamp)} |`);
    }
  }
  out.push("", "---", "", FOOTER, "");
  return out.join("\n");
}
