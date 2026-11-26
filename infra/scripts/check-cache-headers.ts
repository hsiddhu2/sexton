// Cache header check for the hosted site: runbook smoke check 20 (spec fresh-site, Requirement 2.7).
// Usage: npx tsx infra/scripts/check-cache-headers.ts <cloudfront-domain>
// Read-only GET requests over HTTPS, no credentials. Exit 1 when any checked path is FAIL.

import { pathToFileURL } from "node:url";
import { expectedCacheControl } from "../lib/web-cache-headers.js";

/** A path the bucket does not hold, so CloudFront answers with the index.html fallback. Reported as INFO. */
export const FALLBACK_PATH = "/sexton-cache-check-fallback";

/** A missing file under /assets/: the fallback on the /assets/* behaviour. Reported as INFO. */
export const ASSET_FALLBACK_PATH = "/assets/sexton-cache-check-missing.js";

const INFO_PATHS: readonly string[] = [FALLBACK_PATH, ASSET_FALLBACK_PATH];

export type Verdict = "PASS" | "FAIL" | "INFO";

/** The first hashed script under /assets/ that index.html loads, or null. */
export function findHashedAsset(html: string): string | null {
  const match = /<script\b[^>]*\bsrc="(\/assets\/[^"?#]+)"/i.exec(html);
  return match?.[1] ?? null;
}

/** The paths the check requests, in order. */
export function checkPaths(asset: string): string[] {
  return ["/", "/index.html", "/demo/scan.json", "/replay/axios.json", asset, FALLBACK_PATH, ASSET_FALLBACK_PATH];
}

function normalise(value: string): string {
  return value
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .join(", ");
}

/** PASS when the header matches the expected value for the path, directive by directive, ignoring case and spacing. */
export function verdict(path: string, header: string | null): Verdict {
  if (INFO_PATHS.includes(path)) return "INFO";
  if (header === null) return "FAIL";
  return normalise(header) === normalise(expectedCacheControl(path)) ? "PASS" : "FAIL";
}

/** 1 when any verdict is FAIL. INFO does not count. */
export function exitStatus(verdicts: readonly Verdict[]): 0 | 1 {
  return verdicts.includes("FAIL") ? 1 : 0;
}

async function main(domain: string | undefined): Promise<number> {
  if (domain === undefined || !/^[A-Za-z0-9.-]+$/.test(domain)) {
    console.error("usage: npx tsx infra/scripts/check-cache-headers.ts <cloudfront-domain>");
    return 2;
  }
  const base = `https://${domain}`;
  const index = await fetch(`${base}/index.html`, { cache: "no-store" });
  const asset = findHashedAsset(await index.text());
  if (asset === null) {
    console.log(`FAIL  ${String(index.status)} /index.html  no /assets/ script found`);
    return 1;
  }
  const verdicts: Verdict[] = [];
  for (const path of checkPaths(asset)) {
    const response = await fetch(`${base}${path}`, { cache: "no-store" });
    await response.body?.cancel();
    const header = response.headers.get("cache-control");
    const result = verdict(path, header);
    verdicts.push(result);
    console.log(`${result.padEnd(5)} ${String(response.status)} ${path}  cache-control: ${header ?? "(none)"}`);
  }
  return exitStatus(verdicts);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv[2]).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`FAIL  request failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    },
  );
}
