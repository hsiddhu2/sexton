// Publisher change. Spec new-signals, Requirement 1. Pure: documents in, values out.

import { earlierVersion, publishedVersions, type PublishedVersion } from "./history.js";
import type { PublisherChangeValue, PublishMethod, PublishRecord } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function versionEntry(fullPackument: unknown, version: string): Record<string, unknown> | null {
  if (!isRecord(fullPackument)) return null;
  const versions = fullPackument["versions"];
  if (!isRecord(versions) || !Object.hasOwn(versions, version)) return null;
  const entry = versions[version];
  return isRecord(entry) ? entry : null;
}

/** Publisher and Publish method of one version entry. Own properties only. */
export function publishRecord(fullPackument: unknown, version: PublishedVersion): PublishRecord {
  const entry = versionEntry(fullPackument, version.version);
  const user = entry !== null && Object.hasOwn(entry, "_npmUser") ? entry["_npmUser"] : undefined;
  let publisher: string | null = null;
  let method: PublishMethod = "unknown";
  if (isRecord(user)) {
    const name = Object.hasOwn(user, "name") ? user["name"] : undefined;
    publisher = typeof name === "string" && name.length > 0 ? name : null;
    method = Object.hasOwn(user, "trustedPublisher") && isRecord(user["trustedPublisher"]) ? "trusted-publisher" : "token";
  }
  return { version: version.version, publisher, method, publishTime: new Date(version.publishMs).toISOString() };
}

/** The publisherChange value of the installed version. Never throws on malformed input. */
export function publisherChangeValue(fullPackument: unknown, installed: string): PublisherChangeValue {
  const current = publishedVersions(fullPackument).find((v) => v.version === installed);
  const earlier = earlierVersion(fullPackument, installed);
  if (current === undefined || earlier === null) {
    return { status: "no-earlier-version", installed: current === undefined ? null : publishRecord(fullPackument, current) };
  }
  const now = publishRecord(fullPackument, current);
  const before = publishRecord(fullPackument, earlier);
  const status = now.publisher === null || before.publisher === null ? "unknown" : now.publisher === before.publisher ? "same" : "changed";
  return { status, installed: now, earlier: before };
}
