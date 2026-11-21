// sexton evidence and sexton evidence --verify. Spec: .kiro/specs/cli-and-action, Requirement 8 (R-CL-3).

import { buildEvidencePack, renderEvidenceMarkdown, serialiseEvidencePack, sha256HexOfText, verifyEvidencePack } from "@sexton/engine";
import { resolveTarget, runScanPipeline } from "../compose.js";
import type { CliDeps } from "../deps.js";
import { couldNotWrite, MSG } from "../messages.js";
import { writeLines } from "../output.js";
import { safe } from "../safe-text.js";

export const MAX_VERIFY_BYTES = 16 * 1024 * 1024;
export const PACK_FILE = "sexton-evidence.json";
export const REPORT_FILE = "sexton-evidence.md";
const COMMIT = /^[0-9a-f]{40}$/;

async function digestOf(text: string | null | undefined): Promise<string | null> {
  return typeof text === "string" ? sha256HexOfText(text) : null;
}

export async function evidenceCommand(target: string | undefined, repo: string | undefined, outDir: string | undefined, deps: CliDeps): Promise<number> {
  const resolved = await resolveTarget(target, repo, deps);
  if ("ok" in resolved) return writeLines(deps.stderr, resolved.lines, 2);
  const scan = await runScanPipeline(resolved, deps);
  if (!scan.ok) return writeLines(deps.stderr, scan.lines, 2);
  const head = resolved.kind === "path" ? await deps.git.head(resolved.path) : null;
  const built = await buildEvidencePack({
    report: scan.report,
    dependencies: scan.dependencies,
    policyResult: scan.policy,
    policyDigest: await digestOf(scan.policyText),
    commit: head !== null && COMMIT.test(head) ? head : null,
    manifestDigests: { packageJson: await digestOf(scan.manifests?.packageJson), packageLock: await digestOf(scan.manifests?.packageLock) },
    remediations: scan.remediations,
    remediationLog: null,
  });
  if (!built.ok) return writeLines(deps.stderr, [safe(built.reason)], 2);
  const dir = deps.resolvePath(deps.cwd, outDir ?? ".");
  for (const [name, text] of [
    [PACK_FILE, serialiseEvidencePack(built.pack)],
    [REPORT_FILE, renderEvidenceMarkdown(built.pack)],
  ] as const) {
    if (!(await deps.files.writeText(deps.resolvePath(dir, name), text))) return writeLines(deps.stderr, [couldNotWrite(name)], 2);
  }
  return writeLines(deps.stdout, [`wrote ${PACK_FILE} and ${REPORT_FILE}`, `digest ${built.pack.integrity.digest}`], 0);
}

export async function verifyCommand(file: string, deps: CliDeps): Promise<number> {
  const read = await deps.files.readPath(deps.resolvePath(deps.cwd, file), MAX_VERIFY_BYTES);
  if (read.kind === "too-large") return writeLines(deps.stderr, [MSG.verifyTooLarge], 2);
  if (read.kind !== "found") return writeLines(deps.stderr, [read.kind === "invalid" ? MSG.notAPack : MSG.verifyMissing], 2);
  let value: unknown;
  try {
    value = JSON.parse(read.text);
  } catch {
    return writeLines(deps.stderr, [MSG.notAPack], 2);
  }
  const result = await verifyEvidencePack(value);
  if (result.ok) {
    const digest = (value as { integrity: { digest: string } }).integrity.digest;
    return writeLines(deps.stdout, [`verified ${safe(digest, 64)}`], 0);
  }
  if (result.reason === "digest-mismatch") return writeLines(deps.stdout, [MSG.verifyMismatch], 1);
  return writeLines(deps.stderr, [MSG.notAPack], 2);
}
