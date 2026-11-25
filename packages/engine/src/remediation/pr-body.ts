// PR body. Spec: .kiro/specs/remediation, Requirement 5, HP decisions 4 to 7, and .kiro/specs/migration-node-sass,
// Requirements 6, 9.3. Pure: no clock, no I/O.
// Every string from outside the engine goes through escapeField. Every other piece is fixed text.

import {
  SIGNAL_NAMES,
  type PackageJsonEdit,
  type PackageSignals,
  type PrContext,
  type PublishRecord,
  type RemediationPlan,
  type SignalName,
} from "../types.js";
import { UNKNOWN_PUBLISHER } from "../state.js";
import { escapeField as F } from "./escape-field.js";
import { RECIPE_NOTES } from "./recipe-notes.js";

export const MAX_BODY_CHARS = 60000;
export const LIST_LIMIT = 20;
export const REDUCED_LIST_LIMIT = 5;

export const POSSESSED_WARNING =
  "> **Warning:** this package is Possessed. Check the maintainer, provenance, install-script, new dependency or publisher change before you merge.";
export const MAJOR_UPGRADE_LINE = "Major upgrade: the chosen version is outside the declared range.";
export const RANGE_STYLE_LINE = "Range style preserved.";
export const REMOVE_SCOPE_LINE = "The edit removes it from every dependency section of package.json that lists it.";
/** Spec cli-and-action, Requirement 2.7: what the import count cannot see. */
export const REMOVE_CHECK_LINE =
  "No reference to this package was found in the files read. A package loaded by name at run time is not detected. Check before merging.";
export const MIGRATE_LINE = "A migration is proposed. Its changes come from the recipe.";
export const NO_RULE_LINE = "No policy rule fails for this package.";
export const NONE_LINE = "none";
export const NOT_SCANNED_LINE = "Stylesheets and scripts: not scanned.";
/** Spec remediation-safety, D2: the scan was capped or skipped a file. */
export const INCOMPLETE_SCAN_LINE = "Stylesheets and scripts: scan incomplete, some files were not read. Check them by hand.";

export const LOCKFILE_NOTE =
  "`package-lock.json` is not changed on this branch. Run `npm install` on this branch before `npm ci` works.";

function list(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  const text = shown.length === 0 ? "none" : shown.join("; ");
  return rest > 0 ? `${text}; and ${String(rest)} more` : text;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function renderValue(name: SignalName, signals: PackageSignals, limit: number): string {
  switch (name) {
    case "lastPublish": {
      const v = signals.lastPublish.value;
      return v === null ? "no publish date" : F(v);
    }
    case "deprecated":
      return yesNo(signals.deprecated.value === true);
    case "hasInstallScript":
      return yesNo(signals.hasInstallScript.value === true);
    case "advisories":
      return list((signals.advisories.value ?? []).map((a) => `${F(a.id)} ${a.severity} ${F(a.summary)}`), limit);
    case "maintainers":
      return list((signals.maintainers.value ?? []).map((m) => F(m)), limit);
    case "provenance": {
      const v = signals.provenance.value;
      if (v === null) return "none";
      return v.present ? `present ${F(v.predicateType ?? "")}` : "absent";
    }
    case "transitiveReach": {
      const v = signals.transitiveReach.value;
      return v === null ? "none" : `reach ${String(v.reach)}, graphs missing ${String(v.graphsMissing)}`;
    }
    case "maintainerChange": {
      const v = signals.maintainerChange.value;
      if (v === null) return "none";
      if (v.status === "history-insufficient") return "history insufficient";
      return list(
        v.events.map((e) => F(`${e.kind} ${e.eventTime}: ${e.before.join(", ")} -> ${e.after.join(", ")}`)),
        limit,
      );
    }
    case "provenanceRegression": {
      const v = signals.provenanceRegression.value;
      if (v === null) return "none";
      if (v.status === "regression") return `regression from ${F(v.earlierVersion)} to ${F(v.installedVersion)}, snapshot ${F(v.snapshotCaptureTime)}`;
      if (v.status === "no-regression") return `no regression, snapshot ${F(v.snapshotCaptureTime)}`;
      return `history insufficient ${F(v.reason)}`;
    }
    case "newInstallScript":
      return list((signals.newInstallScript.value ?? []).map((e) => `${F(e.version)} ${F(e.publishTime)}`), limit);
    case "publisherChange": {
      const v = signals.publisherChange.value;
      if (v === null) return "none";
      if (v.status === "no-earlier-version") return "no earlier version";
      const who = (r: PublishRecord): string => `${r.publisher === null ? UNKNOWN_PUBLISHER : F(r.publisher)} (${r.method}) ${F(r.version)} ${F(r.publishTime)}`;
      return `${v.status}: ${who(v.earlier)} -> ${who(v.installed)}`;
    }
    case "newDependency": {
      const v = signals.newDependency.value;
      if (v === null) return "none";
      if (v.status === "no-earlier-version") return "no earlier version";
      const rows = v.added.map(
        (d) =>
          `${F(d.name)} ${F(d.range)} -> ${d.resolvedVersion === null ? "unresolved" : F(d.resolvedVersion)}, published ${d.resolvedPublishTime === null ? "unknown" : F(d.resolvedPublishTime)}, install script ${d.installScript === null ? "unknown" : yesNo(d.installScript)}`,
      );
      const text = list(rows, limit);
      return `${String(v.addedCount)} since ${F(v.earlierVersion)}: ${text}${v.capped ? "; capped at 5" : ""}`;
    }
  }
}

function signalRow(name: SignalName, signals: PackageSignals, limit: number): string {
  const signal = signals[name];
  const value = signal.available ? renderValue(name, signals, limit) : `unavailable ${F(signal.reason)}`;
  return `| ${F(name)} | ${value} | ${F(signal.source)} | ${F(signal.fetchedAt)} |`;
}

function proposedChange(plan: RemediationPlan): string[] {
  const lines = [`**Kind:** ${F(plan.kind)}`, ""];
  if (plan.status !== "proposed") {
    lines.push(`No change proposed: ${F(plan.reason ?? "")}`);
    return lines;
  }
  if (plan.kind === "bump") {
    lines.push(`Bump ${F(plan.packageName)} from ${F(plan.installedVersion)} to ${F(plan.chosenVersion ?? "")}.`, "", RANGE_STYLE_LINE);
    if (plan.majorUpgrade === true) lines.push("", MAJOR_UPGRADE_LINE);
  } else if (plan.kind === "remove") {
    lines.push(`Remove ${F(plan.packageName)}, listed in ${F(plan.edit?.section ?? "")}.`, "", REMOVE_SCOPE_LINE, "", REMOVE_CHECK_LINE);
  } else if (plan.edits !== undefined) {
    lines.push(...plan.edits.map((e) => `- ${editLine(e)}`));
    if (plan.edits.some((e) => e.op === "remove-dependency")) lines.push("", REMOVE_SCOPE_LINE);
  } else {
    lines.push(MIGRATE_LINE);
  }
  return lines;
}

/** The version of a range the Engine wrote itself: the range without a leading caret or tilde. */
function versionOf(range: string): string {
  return range.startsWith("^") || range.startsWith("~") ? range.slice(1) : range;
}

function editLine(edit: PackageJsonEdit): string {
  switch (edit.op) {
    case "remove-dependency":
      return `Remove ${F(edit.name)} from ${F(edit.section)}.`;
    case "add-dependency":
      return `Add ${F(edit.name)} ${F(versionOf(edit.range))} to ${F(edit.section)} with a caret range.`;
    case "set-range":
      return `Raise ${F(edit.name)} to ${F(versionOf(edit.range))}, range style preserved.`;
  }
}

/** Files changed and Review before merging, for a proposed migrate plan. */
function migrationSections(plan: RemediationPlan, limit: number): string[] {
  const m = plan.migration;
  if (plan.status !== "proposed" || plan.kind !== "migrate" || m === undefined) return [];
  const lines = ["## Files changed", "", ...m.filesChanged.map((f) => `- ${F(f)}`), "", "## Review before merging", ""];
  const shown = m.reviewSites.slice(0, limit);
  for (const site of shown) {
    const where = site.line === null ? site.path : `${site.path}:${String(site.line)}`;
    lines.push(`- ${F(where)} ${site.rule}: ${F(site.excerpt)}`);
  }
  if (m.reviewSites.length > shown.length) lines.push("", `and ${String(m.reviewSites.length - shown.length)} more`);
  const incomplete = m.scan.performed && (m.scan.capped || m.scan.skipped > 0);
  if (m.reviewSites.length === 0 && m.scan.performed && !incomplete) lines.push(NONE_LINE);
  if (incomplete) lines.push(...(shown.length > 0 ? [""] : []), INCOMPLETE_SCAN_LINE);
  if (!m.scan.performed) lines.push(...(shown.length > 0 ? [""] : []), NOT_SCANNED_LINE);
  const notes = m.notes.filter((n) => RECIPE_NOTES.has(n));
  for (const note of notes) lines.push("", `${note}.`);
  lines.push("");
  return lines;
}

function rulesSection(context: PrContext, limit: number): string[] {
  const rules = context.failingRules;
  if (rules.length === 0) return [NO_RULE_LINE];
  const lines = rules
    .slice(0, limit)
    .map((r, i) => `${String(i + 1)}. Rule ${F(String(r.index))} ${F(r.type)}${r.name !== undefined ? ` ${F(r.name)}` : ""}: ${F(r.reason)}`);
  if (rules.length > limit) lines.push("", `and ${String(rules.length - limit)} more`);
  return lines;
}

function render(plan: RemediationPlan, context: PrContext, limit: number): string {
  const signals = context.entry.signals;
  const lines = [
    "# Sexton remediation",
    "",
    `**Package:** ${F(plan.packageName)} ${F(plan.installedVersion)}`,
    "",
    `**State:** ${F(plan.state)} ${F(plan.stateReason)}`,
    "",
  ];
  if (plan.state === "Possessed") lines.push(POSSESSED_WARNING, "");
  lines.push("## Signals", "", "| Signal | Value | Source | Fetched at |", "|---|---|---|---|");
  for (const name of SIGNAL_NAMES) lines.push(signalRow(name, signals, limit));
  lines.push("", "## Proposed change", "", ...proposedChange(plan), "", "## Failing policy rules", "", ...rulesSection(context, limit), "");
  lines.push(...migrationSections(plan, limit));
  const carriesEdits = plan.kind === "migrate" ? plan.edits !== undefined : true;
  if (plan.status === "proposed" && carriesEdits) lines.push("## Lockfile", "", LOCKFILE_NOTE, "");
  lines.push("---", "", `Generated by Sexton ${F(context.engineVersion)} from a scan at ${F(context.generatedAt)}.`, "");
  return lines.join("\n");
}

/** The Markdown body for any plan. At most MAX_BODY_CHARS UTF-16 units. */
export function buildPrBody(plan: RemediationPlan, context: PrContext): string {
  const full = render(plan, context, LIST_LIMIT);
  return full.length <= MAX_BODY_CHARS ? full : render(plan, context, REDUCED_LIST_LIMIT);
}
