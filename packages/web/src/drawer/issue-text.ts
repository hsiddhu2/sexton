// The text "Copy this as an issue" puts on the clipboard (spec clean-site, design C5, requirement 7.6): the package,
// its version, State and reason, and every signal with its value, source and fetch time, as plain text. Pure.
import type { RemediationEntry } from "@sexton/api";
import { reasonSentence } from "../panel/reason-family.js";
import type { DrawerModel } from "./drawer-model.js";
import { SIGNAL_LABELS } from "./signal-labels.js";

const labelOf = (name: string): string => (Object.hasOwn(SIGNAL_LABELS, name) ? SIGNAL_LABELS[name as keyof typeof SIGNAL_LABELS] : name);

/** One line: a JSON value without its line breaks and indents. */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ");
}

/** Pure. `name` and `version` as the Drawer shows them; the plan, when there is one, adds its title and summary. */
export function issueText(model: DrawerModel, name: string, version: string, plan: RemediationEntry | null): string {
  const lines = [
    `Sexton: ${name} ${version} is ${model.state}`,
    "",
    `Package: ${name} ${version}`,
    `State: ${model.state}`,
    `Why: ${reasonSentence(model.stateReason)}`,
    `Reason: ${model.stateReason}`,
  ];
  if (plan !== null) lines.push(`Plan: ${plan.title}. ${plan.summary}`);
  lines.push("", "Signals");
  for (const s of model.signals) {
    const value = s.available && s.valueText !== null ? oneLine(s.valueText) : `unavailable (${s.reason ?? "not recorded"})`;
    lines.push(`- ${labelOf(s.name)}: ${value} (source ${s.source}, fetched ${s.fetchedAt})`);
  }
  if (model.missingSignals.length > 0) lines.push("", `Missing signals: ${model.missingSignals.map(labelOf).join(", ")}`);
  return lines.join("\n");
}
