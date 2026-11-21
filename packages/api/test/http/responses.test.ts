// Response bodies and headers. Spec: .kiro/specs/infra, Requirements 4.2 to 4.10.

import { INTAKE_ERROR_CODES, type IntakeError, type ValidationError } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import type { ScanResponse } from "../../src/contract.js";
import {
  errorResponse,
  FIXED_MESSAGES,
  intakeErrorSpec,
  internalErrorSpec,
  okResponse,
  policyErrorSpec,
  policyFetchFailedSpec,
  requestErrorSpec,
} from "../../src/http/responses.js";

function body(result: { body?: string | undefined }): Record<string, unknown> {
  return JSON.parse(result.body ?? "{}") as Record<string, unknown>;
}

describe("error table", () => {
  it("method-not-allowed is 405 and invalid-request is 400, with fixed text", () => {
    expect(requestErrorSpec("method-not-allowed")).toEqual({ status: 405, body: { code: "method-not-allowed", message: "Only GET is supported." } });
    expect(requestErrorSpec("invalid-request")).toEqual({ status: 400, body: { code: "invalid-request", message: "Send GET /api/scan?repo=<public GitHub URL>." } });
    expect(requestErrorSpec("invalid-url").status).toBe(400);
    expect(requestErrorSpec("invalid-url").body.message).toMatch(/^The URL is not a public GitHub repository URL/);
  });

  it("maps each intake code to its status and copies only code, message and file", () => {
    const expected: Record<string, number> = {
      "invalid-url": 400,
      "missing-package-json": 422,
      "invalid-package-json": 422,
      "invalid-lockfile": 422,
      "manifest-too-large": 422,
      "fetch-failed": 502,
      "internal-error": 500,
    };
    for (const code of INTAKE_ERROR_CODES) {
      const error = { ok: false, code, message: "engine text", file: "package.json", extra: "SECRET" } as IntakeError;
      const spec = intakeErrorSpec(error);
      expect(spec.status).toBe(expected[code]);
      expect(JSON.stringify(spec)).not.toContain("SECRET");
      if (code === "internal-error") expect(spec.body).toEqual({ code: "internal-error", message: "The scan failed unexpectedly." });
      else if (code !== "invalid-url") expect(spec.body).toEqual({ code, message: "engine text", file: "package.json" });
    }
  });

  it("leaves file out when the engine gives none", () => {
    expect(intakeErrorSpec({ ok: false, code: "fetch-failed", message: "m" }).body).toEqual({ code: "fetch-failed", message: "m" });
  });

  it("invalid-policy keeps at most 20 errors, code and path only, paths cut to 200", () => {
    const errors: ValidationError[] = Array.from({ length: 25 }, (_, i) => ({ code: "UNKNOWN_FIELD", path: `/${"k".repeat(300)}${String(i)}`, message: "QUOTED-KEY" }));
    const spec = policyErrorSpec(errors);
    expect(spec.status).toBe(422);
    expect(spec.body.code).toBe("invalid-policy");
    expect(spec.body.message).toBe("sexton.policy.yml is not valid.");
    expect(spec.body.errors).toHaveLength(20);
    for (const e of spec.body.errors ?? []) {
      expect(Object.keys(e).sort()).toEqual(["code", "path"]);
      expect(e.path).toHaveLength(200);
    }
    expect(JSON.stringify(spec)).not.toContain("QUOTED-KEY");
  });

  it("a failed policy fetch is 502 fetch-failed naming the file, and internal-error is 500", () => {
    expect(policyFetchFailedSpec()).toEqual({ status: 502, body: { code: "fetch-failed", message: "sexton.policy.yml could not be fetched.", file: "sexton.policy.yml" } });
    expect(internalErrorSpec()).toEqual({ status: 500, body: { code: "internal-error", message: FIXED_MESSAGES["internal-error"] } });
  });
});

describe("headers", () => {
  it("errors are no-store, JSON, nosniff, with the request ID", () => {
    const result = errorResponse(requestErrorSpec("invalid-request"), "rid-1");
    expect(result.statusCode).toBe(400);
    expect(result.headers).toEqual({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-sexton-request-id": "rid-1",
    });
    expect(body(result)).toEqual({ code: "invalid-request", message: FIXED_MESSAGES["invalid-request"] });
  });

  it("success is public for five minutes and carries the body", () => {
    const scan = { report: { generatedAt: "2026-11-20T00:00:00.000Z", packages: [] }, policy: { source: "default", pass: true, rules: [] } } as unknown as ScanResponse;
    const result = okResponse(scan, "rid-2");
    expect(result.statusCode).toBe(200);
    expect(result.headers?.["cache-control"]).toBe("public, max-age=300");
    expect(result.headers?.["x-sexton-request-id"]).toBe("rid-2");
    expect(body(result)).toEqual(scan);
  });
});
