// sexton scan. Spec: .kiro/specs/cli-and-action, Requirement 6. Exit 0 when the scan file is written, whatever the policy.

import type { CliDeps } from "../deps.js";
import { couldNotWrite } from "../messages.js";
import { safe } from "../safe-text.js";
import { renderScanFooter, renderTable } from "../table.js";
import { resolveTarget, runScanPipeline } from "../compose.js";
import { writeLines } from "../output.js";

export async function scanCommand(target: string, repo: string | undefined, out: string | undefined, deps: CliDeps): Promise<number> {
  const resolved = await resolveTarget(target, repo, deps);
  if ("ok" in resolved) return writeLines(deps.stderr, resolved.lines, 2);
  const scan = await runScanPipeline(resolved, deps);
  if (!scan.ok) return writeLines(deps.stderr, scan.lines, 2);
  writeLines(deps.stdout, [...renderTable(scan.report), "", ...renderScanFooter(scan.report, scan.policy, scan.remediations)], 0);
  const file = deps.resolvePath(deps.cwd, out ?? "scan.json");
  const text = JSON.stringify({ report: scan.report, policy: scan.policy, remediations: scan.remediations }, null, 2) + "\n";
  if (!(await deps.files.writeText(file, text))) return writeLines(deps.stderr, [couldNotWrite(safe(out ?? "scan.json"))], 2);
  return writeLines(deps.stdout, [`wrote ${safe(out ?? "scan.json")}`], 0);
}
