// Verifies an evidence pack against its own digest. Spec: .kiro/specs/evidence-pack, Requirement 4.
// The digest shows an edit only to a reviewer who got it from somewhere else. It is not a signature. Never rejects.

import type { EvidenceVerifyResult } from "../types.js";
import { canonicalJson } from "./canonical-json.js";
import { sha256HexOfText } from "./sha256.js";

const DIGEST = /^[0-9a-f]{64}$/;
const INTEGRITY_KEYS = ["algorithm", "canonicalization", "digest"];

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function own(value: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}

async function verify(value: unknown): Promise<EvidenceVerifyResult> {
  if (!isRecord(value)) return { ok: false, reason: "malformed" };
  const version = own(value, "evidenceVersion");
  if (typeof version !== "number") return { ok: false, reason: "malformed" };
  if (version !== 1) return { ok: false, reason: "unsupported-version" };
  const integrity = own(value, "integrity");
  if (
    !isRecord(integrity) ||
    Object.keys(integrity).length !== INTEGRITY_KEYS.length ||
    own(integrity, "algorithm") !== "SHA-256" ||
    own(integrity, "canonicalization") !== "RFC 8785"
  ) {
    return { ok: false, reason: "malformed" };
  }
  const digest = own(integrity, "digest");
  if (typeof digest !== "string" || !DIGEST.test(digest)) return { ok: false, reason: "malformed" };
  const body = own(value, "body");
  if (!isRecord(body)) return { ok: false, reason: "malformed" };
  const text = canonicalJson(body);
  if (text === null) return { ok: false, reason: "malformed" };
  return (await sha256HexOfText(text)) === digest ? { ok: true } : { ok: false, reason: "digest-mismatch" };
}

/** Recomputes the digest of body and compares. Requirement 4.1. */
export async function verifyEvidencePack(value: unknown): Promise<EvidenceVerifyResult> {
  try {
    return await verify(value);
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
