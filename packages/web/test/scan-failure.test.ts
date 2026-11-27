// Spec clean-site, design C10 and Property 7: every failed scan gets exactly one card from the fixed table, and the
// code reader keeps a body code only when it is one of the API's error codes (12.2, 12.3, 12.4).
import type { ApiErrorCode } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { errorCodeOf, MAX_ERROR_BODY_BYTES } from "../src/load/error-code.js";
import { API_ERROR_CODES } from "../src/load/lists.js";
import { loadScan } from "../src/load/load-scan.js";
import { FAILURE_CARDS, failureCard, type FailureCardId } from "../src/load/scan-failure.js";

const SECRET = "@@secret-body@@";
const arbStatus = fc.option(fc.integer({ min: 400, max: 599 }), { nil: null });
const arbCode = fc.option(fc.constantFrom<ApiErrorCode>(...API_ERROR_CODES), { nil: null });

/** 12.2's order, written again from the requirement. */
function expectedCard(status: number | null, code: ApiErrorCode | null): FailureCardId {
  if (status === null) return "network";
  if (status === 429) return "rate-limited";
  if (status === 503 || status === 504 || code === "fetch-failed") return "busy";
  if (code === "missing-package-json") return "not-readable";
  if (code === "invalid-url") return "invalid-url";
  if (code === "invalid-package-json" || code === "invalid-lockfile") return "invalid-file";
  if (code === "manifest-too-large") return "too-large";
  if (code === "invalid-policy") return "invalid-policy";
  return "generic";
}

const byteLength = (s: string): number => new TextEncoder().encode(s).byteLength;

describe("Feature: clean-site, Property 7: Every failed scan gets exactly one card from the fixed table", () => {
  it("returns the member of the table that is the first match of 12.2's order, from the two inputs only", () => {
    const table = Object.values(FAILURE_CARDS);
    fc.assert(
      fc.property(arbStatus, arbCode, (status, code) => {
        const card = failureCard(status, code);
        expect(table).toContain(card);
        expect(card.id).toBe(expectedCard(status, code));
        expect(failureCard(status, code)).toBe(card);
      }),
      { numRuns: 100 },
    );
  });

  it("keeps a body code only when it is a known code in a body of at most 4 KiB, for any body up to 8 KiB", () => {
    const arbBody = fc.oneof(
      fc.string({ maxLength: 8192 }),
      fc.fullUnicodeString({ maxLength: 2048 }),
      fc.record({ code: fc.oneof(fc.constantFrom(...API_ERROR_CODES), fc.string(), fc.integer()), message: fc.string() }).map((b) => JSON.stringify(b)),
      fc.tuple(fc.constantFrom(...API_ERROR_CODES), fc.nat({ max: 8000 })).map(([code, pad]) => JSON.stringify({ code, message: SECRET.repeat(1) + " ".repeat(pad) })),
      fc.constantFrom(...API_ERROR_CODES).map((code) => JSON.stringify([{ code }])),
      fc.jsonValue().map((j) => JSON.stringify(j)),
    ).filter((b) => byteLength(b) <= 8192);
    fc.assert(
      fc.property(arbBody, (body) => {
        const got = errorCodeOf(body);
        if (got === null) return;
        expect(API_ERROR_CODES).toContain(got);
        expect(byteLength(body)).toBeLessThanOrEqual(MAX_ERROR_BODY_BYTES);
        const parsed = JSON.parse(body) as { code?: unknown };
        expect(parsed.code).toBe(got);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("failure card and code reader examples", () => {
  it("reads the code of an API body and nothing else", () => {
    expect(errorCodeOf(JSON.stringify({ code: "missing-package-json", message: SECRET }))).toBe("missing-package-json");
    expect(errorCodeOf(JSON.stringify({ code: "rate-limited" }))).toBeNull();
    expect(errorCodeOf("<html>429</html>")).toBeNull();
    expect(errorCodeOf(JSON.stringify({ code: "invalid-url", pad: "x".repeat(MAX_ERROR_BODY_BYTES) }))).toBeNull();
    expect(errorCodeOf('{"__proto__":{"code":"invalid-url"}}')).toBeNull();
  });

  it("gives 429 with code rate-limited its own card, and 404 with missing-package-json the read card", () => {
    expect(failureCard(429, null).sentence).toBe("Too many scans from your network right now.");
    expect(failureCard(404, "missing-package-json")).toEqual({
      id: "not-readable",
      sentence: "We could not read that repo.",
      next: "Check the spelling. Sexton can only read public repos with a package.json at the top.",
    });
    expect(failureCard(500, "internal-error").id).toBe("generic");
    expect(failureCard(400, "fetch-failed").id).toBe("busy");
  });

  it("puts the known code on the load error and keeps no other text of the body (12.3, 12.4)", async () => {
    const load = (body: string, status: number) =>
      loadScan("https://api.example/scan?repo=x", {
        fetchFn: (() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch,
        signal: new AbortController().signal,
      });
    const known = await load(JSON.stringify({ code: "invalid-policy", message: SECRET }), 422);
    expect(known.ok ? null : known.error).toEqual({ code: "fetch-failed", message: "The scan could not be fetched. (HTTP 422)", status: 422, apiCode: "invalid-policy" });
    const unknown = await load(JSON.stringify({ code: SECRET }), 404);
    expect(unknown.ok ? null : unknown.error).toEqual({ code: "fetch-failed", message: "The scan could not be fetched. (HTTP 404)", status: 404 });
    const big = await load(JSON.stringify({ code: "invalid-url", pad: "x".repeat(5000) }), 400);
    expect(big.ok ? null : big.error.apiCode).toBeUndefined();
    expect(JSON.stringify([known, unknown, big])).not.toContain(SECRET);
  });
});
