// github-raw client: package.json and package-lock.json from raw.githubusercontent.com. Requirement 2.

import { cacheKey } from "../cache.js";
import { requestWithRetry, UpstreamError, type TransportRequest } from "../http.js";
import { isValidOwner, isValidRepo } from "../intake/url.js";
import { parsePackageJson } from "../intake/manifest.js";
import type { RepoRef } from "../types.js";
import type { ClientContext } from "./context.js";

export const GITHUB_RAW_SOURCE = "github-raw";
export const GITHUB_RAW_HOST = "https://raw.githubusercontent.com";
export const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;

export type ManifestFile = "package.json" | "package-lock.json";

export type ManifestFailure = "http-status" | "network" | "unsupported-transport" | "invalid-encoding" | "invalid-reference";

export type ManifestOutcome =
  | { readonly kind: "found"; readonly text: string }
  | { readonly kind: "not-found" }
  | { readonly kind: "too-large" }
  | { readonly kind: "failed"; readonly failure: ManifestFailure; readonly status: number | null };

export type LockfileOutcome = ManifestOutcome | { readonly kind: "not-attempted" };

type CachedManifest = { readonly kind: "found"; readonly text: string } | { readonly kind: "not-found" };

class ManifestTooLargeError extends Error {}
class ManifestReadError extends Error {
  constructor(readonly failure: "unsupported-transport" | "invalid-encoding") {
    super(failure);
  }
}

const FILE_NAMES: Readonly<Record<ManifestFile, string>> = {
  "package.json": "package.json",
  "package-lock.json": "package-lock.json",
};
const REQUEST: TransportRequest = { method: "GET", headers: { Accept: "text/plain" } };
const NOT_FOUND: CachedManifest = { kind: "not-found" };

/** Builds the one URL shape this client may request. Throws on an invalid reference. */
export function manifestUrl(reference: Pick<RepoRef, "owner" | "repo">, file: ManifestFile): string {
  const name = Object.hasOwn(FILE_NAMES, file) ? FILE_NAMES[file] : undefined;
  if (name === undefined) throw new Error("invalid manifest file");
  if (typeof reference.owner !== "string" || typeof reference.repo !== "string") throw new Error("invalid reference");
  if (!isValidOwner(reference.owner) || !isValidRepo(reference.repo)) throw new Error("invalid reference");
  return `${GITHUB_RAW_HOST}/${reference.owner}/${reference.repo}/HEAD/${name}`;
}

async function download(ctx: ClientContext, url: string): Promise<CachedManifest> {
  const response = await requestWithRetry(ctx.transport, url, REQUEST, ctx.retry ?? {});
  if (response.status === 404) return NOT_FOUND;
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw new UpstreamError(url, response.status);
  }
  if (response.text === undefined) throw new ManifestReadError("unsupported-transport");
  const body = await response.text(MAX_MANIFEST_BYTES);
  if (!body.ok) {
    throw body.reason === "too-large" ? new ManifestTooLargeError() : new ManifestReadError("invalid-encoding");
  }
  return { kind: "found", text: body.text };
}

function outcomeFromError(error: unknown): ManifestOutcome {
  if (error instanceof ManifestTooLargeError) return { kind: "too-large" };
  if (error instanceof UpstreamError) return { kind: "failed", failure: "http-status", status: error.status };
  if (error instanceof ManifestReadError) return { kind: "failed", failure: error.failure, status: null };
  return { kind: "failed", failure: "network", status: null };
}

/** Fetches one Manifest through the Transport and the Cache. Never throws. */
export async function fetchManifest(ctx: ClientContext, reference: RepoRef, file: ManifestFile): Promise<ManifestOutcome> {
  let url: string;
  try {
    url = manifestUrl(reference, file);
  } catch {
    return { kind: "failed", failure: "invalid-reference", status: null };
  }
  try {
    const key = cacheKey(GITHUB_RAW_SOURCE, `${reference.owner}/${reference.repo}`, file);
    return await ctx.cache.get<CachedManifest>(key, () => download(ctx, url));
  } catch (error) {
    return outcomeFromError(error);
  }
}

/** Fetches package.json, then the lockfile only when the gate accepts package.json. Requirement 2.13. */
export async function fetchRepoManifests(
  ctx: ClientContext,
  reference: RepoRef,
  gate: (packageJsonText: string) => boolean = (text) => parsePackageJson(text).ok,
): Promise<{ readonly packageJson: ManifestOutcome; readonly lockfile: LockfileOutcome }> {
  const packageJson = await fetchManifest(ctx, reference, "package.json");
  if (packageJson.kind !== "found" || !gate(packageJson.text)) {
    return { packageJson, lockfile: { kind: "not-attempted" } };
  }
  return { packageJson, lockfile: await fetchManifest(ctx, reference, "package-lock.json") };
}
