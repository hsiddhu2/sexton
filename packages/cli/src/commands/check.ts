// sexton check. Spec: .kiro/specs/cli-and-action, Requirement 7 (R-CL-2, R-PO-6). Exit 1 when any rule fails.

import { renderCheck } from "../check-output.js";
import { resolveTarget, runScanPipeline } from "../compose.js";
import type { CliDeps } from "../deps.js";
import { couldNotWrite } from "../messages.js";
import { writeLines } from "../output.js";
import { safe } from "../safe-text.js";
import { renderSummary } from "../summary.js";

export async function checkCommand(target: string | undefined, repo: string | undefined, summary: string | undefined, deps: CliDeps): Promise<number> {
  const resolved = await resolveTarget(target, repo, deps);
  if ("ok" in resolved) return writeLines(deps.stderr, resolved.lines, 2);
  const scan = await runScanPipeline(resolved, deps);
  if (!scan.ok) return writeLines(deps.stderr, scan.lines, 2);
  writeLines(deps.stdout, renderCheck(scan.policy), 0);
  if (summary !== undefined) {
    const ok = await deps.files.writeText(deps.resolvePath(deps.cwd, summary), renderSummary(scan.report, scan.policy, scan.remediations));
    if (!ok) return writeLines(deps.stderr, [couldNotWrite(safe(summary))], 2);
  }
  return scan.policy.pass ? 0 : 1;
}
