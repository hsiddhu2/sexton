// The fix tab of the Drawer (spec clean-site, design C5, requirements 7.3 to 7.16, 7.26 and 7.27): what it shows for a
// package, its plan and the kind of scan. At most one copy button ever shows. Pure.
import type { PackageHealth, PackageJsonEdit, RemediationEntry, State } from "@sexton/api";
import { reasonFamily, type Family } from "../panel/reason-family.js";

/** The Sample scan, a Live scan whose response has actions.remediate true, or any other scan. */
export type ScanKind = "sample" | "live-remediate" | "live";

export const OPEN_PR_TEXT = "Open pull request";
export const COPY_PR_TEXT = "Copy pull request text";
export const COPY_ISSUE_TEXT = "Copy this as an issue";
export const READ_PR_TEXT = "Read the pull request text";
export const HOW_LINK_TEXT = "How does this work?";
export const COPIED_TEXT = "Copied. Paste it into a pull request or an issue on your repo.";
export const COPY_BLOCKED_TEXT = "Copy was blocked by the browser. Select the text and copy it by hand.";
export const NO_CHANGE_TEXT = "No automatic change is proposed.";
export const SAFE_ONLY_NOTE = "Sexton only proposes a version it can show is safe.";
export const NO_ACTION_NOTE = "No action needed.";
export const RESTLESS_TITLE = "Nothing urgent";
export const RESTLESS_SUMMARY = "No pull request is proposed for a Restless package. Keep an eye on it.";
export const ALIVE_TITLE = "Healthy";
export const ALIVE_SUMMARY = "Nothing to fix.";

/** The note under the buttons of a Proposed plan, by the kind of scan (7.13 to 7.15). */
export const PLAN_NOTE: { readonly [K in ScanKind]: string } = {
  sample:
    "No sign-in needed. Open pull request works on a live scan of hsiddhu2/sexton-demo. For your own repo, Sexton shows this plan and the full pull request text.",
  "live-remediate": "No sign-in needed. This button opens a real pull request on hsiddhu2/sexton-demo.",
  live: "No sign-in needed. For this repo Sexton shows the plan and the full pull request text.",
};

/** The note of a Possessed package with no Proposed plan, by its Reason family (7.7). */
export const POSSESSED_NOTE: { readonly [K in "maintainer" | "provenance" | "install-script" | "new-dependency" | "publisher"]: string } = {
  maintainer: "Check who the new maintainer is before the next install.",
  provenance: "Check why this version has no provenance before the next install.",
  "install-script": "Check what the new install script runs before the next install.",
  "new-dependency": "Check the new dependency before the next install.",
  publisher: "Check who published this version before the next install.",
};
export const POSSESSED_OTHER_NOTE = "Check what changed before the next install.";

export interface DiffLine {
  readonly sign: "+" | "-";
  readonly text: string;
}

export interface FixView {
  /** The box's heading, or null for none. */
  readonly title: string | null;
  readonly summary: string | null;
  /** The package.json change of a Proposed plan; empty when there is none. */
  readonly diff: readonly DiffLine[];
  readonly openPr: boolean;
  /** The one copy button, or null for none (7.5, 7.6). */
  readonly copy: "pr" | "issue" | null;
  readonly note: string | null;
  /** True when the note ends with the "How does this work?" link to the Guide page (7.13 to 7.15). */
  readonly howLink: boolean;
  /** The pull request body for the closed disclosure (7.16), or null. */
  readonly prBody: string | null;
}

const UNHEALTHY: ReadonlySet<State> = new Set<State>(["Possessed", "Dead", "Haunted"]);

function possessedNote(family: Family | null): string {
  switch (family) {
    case "maintainer":
    case "provenance":
    case "install-script":
    case "new-dependency":
    case "publisher":
      return POSSESSED_NOTE[family];
    default:
      return POSSESSED_OTHER_NOTE;
  }
}

/**
 * Pure. One line per Edit. The scan does not carry the range package.json had before, so a set-range Edit gives one
 * added line with its new range, and no removed line is made up for it.
 */
export function diffLines(edits: readonly PackageJsonEdit[]): DiffLine[] {
  return edits.map((edit): DiffLine => {
    const name = JSON.stringify(edit.name);
    switch (edit.op) {
      case "remove-dependency":
        return { sign: "-", text: `${name}` };
      case "set-range":
      case "add-dependency":
        return { sign: "+", text: `${name}: ${JSON.stringify(edit.range)}` };
    }
  });
}

/** Pure. What the fix tab shows for `pkg` with its plan (the first for its name) on a scan of `scan`. */
export function fixView(pkg: PackageHealth, plan: RemediationEntry | undefined, scan: ScanKind): FixView {
  if (plan?.status === "proposed") {
    const edits = plan.intent?.files ?? [];
    return {
      title: plan.title,
      summary: plan.summary,
      diff: diffLines(edits),
      openPr: scan === "live-remediate" && plan.intent !== undefined,
      copy: plan.prBody !== "" ? "pr" : UNHEALTHY.has(pkg.state) ? "issue" : null,
      note: PLAN_NOTE[scan],
      howLink: true,
      prBody: plan.prBody === "" ? null : plan.prBody,
    };
  }
  const none = { diff: [], openPr: false, howLink: false, prBody: null } as const;
  if (UNHEALTHY.has(pkg.state)) {
    const note =
      pkg.state === "Possessed" ? possessedNote(reasonFamily(pkg.stateReason)) : plan?.status === "no-safe-version" ? SAFE_ONLY_NOTE : null;
    return plan === undefined
      ? { ...none, title: NO_CHANGE_TEXT, summary: null, copy: "issue", note }
      : { ...none, title: plan.title, summary: plan.summary, copy: "issue", note };
  }
  if (pkg.state === "Restless") return { ...none, title: RESTLESS_TITLE, summary: RESTLESS_SUMMARY, copy: null, note: NO_ACTION_NOTE };
  return { ...none, title: ALIVE_TITLE, summary: ALIVE_SUMMARY, copy: null, note: NO_ACTION_NOTE };
}
