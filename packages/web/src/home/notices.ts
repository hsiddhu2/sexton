// The notices under the Home headline (spec clean-site, design C3, requirements 2.13 to 2.15), from the scan
// metadata. They replace the unlocked and capped notices of header/header-model.ts. Pure.
import type { ScanResponse } from "@sexton/api";

export const NO_LOCKFILE_NOTICE = "No lockfile: versions were resolved from package.json ranges.";
export const MAX_NOTICE_NAMES = 5;

function rangesNotice(names: readonly string[]): string {
  const lead = names.length === 1 ? "1 package was" : `${String(names.length)} packages were`;
  const shown = names.slice(0, MAX_NOTICE_NAMES).join(", ");
  const rest = names.length > MAX_NOTICE_NAMES ? ` and ${String(names.length - MAX_NOTICE_NAMES)} more` : "";
  return `${lead} resolved from package.json ranges: ${shown}${rest}`;
}

/** Pure. The notices in order: the lockfile notice (2.13) or the ranges notice (2.14), then the capped notice (2.15). */
export function notices(response: ScanResponse): readonly string[] {
  const scan = response.report.scan;
  if (scan === undefined) return [];
  const out: string[] = [];
  if (scan.unlocked) out.push(NO_LOCKFILE_NOTICE);
  else if (scan.unlockedPackages.length > 0) out.push(rangesNotice(scan.unlockedPackages));
  if (scan.capped) out.push(`Showing ${String(response.report.packages.length)} of ${String(scan.totalDirect)} direct dependencies.`);
  return out;
}
