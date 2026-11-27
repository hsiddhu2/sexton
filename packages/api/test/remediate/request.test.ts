// POST /api/remediate request parsing and the allowlist. Spec: .kiro/specs/remediate, Requirements 6.1, 3.12.

import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowlist } from "../../src/remediate/allowlist.js";
import { parseRemediateRequest, topLevelKeys } from "../../src/remediate/request.js";
import { makeEvent } from "../support/events.js";

const REPO = "https://github.com/hsiddhu2/sexton-demo";
const JSON_CT = { "content-type": "application/json", "x-amz-content-sha256": "abc" };

function post(body: string, headers: Record<string, string> = JSON_CT, extra: Partial<Parameters<typeof makeEvent>[0]> = {}) {
  return { ...makeEvent({ method: "POST", rawPath: "/api/remediate", headers, ...extra }), body, isBase64Encoded: false };
}

describe("parseRemediateRequest (6.1)", () => {
  it("accepts the exact shape and reports whether the payload hash header arrived", () => {
    const r = parseRemediateRequest(post(JSON.stringify({ repo: REPO, package: "node-sass" })));
    expect(r).toMatchObject({ ok: true, packageName: "node-sass", bodyHash: true });
    if (r.ok) expect(r.repo.url).toBe(REPO);
    expect(parseRemediateRequest(post(JSON.stringify({ package: "@scope/x", repo: REPO }), { "Content-Type": "application/json; charset=UTF-8" }))).toMatchObject({
      ok: true,
      bodyHash: false,
    });
  });

  it("accepts a base64 body", () => {
    const body = Buffer.from(JSON.stringify({ repo: REPO, package: "lodash" })).toString("base64");
    expect(parseRemediateRequest({ ...post(""), body, isBase64Encoded: true }).ok).toBe(true);
  });

  it.each(["GET", "OPTIONS", "PUT", "DELETE"])("answers 405 for %s", (method) => {
    expect(parseRemediateRequest({ ...post("{}"), requestContext: { ...post("{}").requestContext, http: { ...post("{}").requestContext.http, method } } })).toEqual({
      ok: false,
      status: 405,
      code: "method-not-allowed",
    });
  });

  it.each([
    ["text/plain", { "content-type": "text/plain" }],
    ["form", { "content-type": "application/x-www-form-urlencoded" }],
    ["multipart", { "content-type": "multipart/form-data; boundary=x" }],
    ["no content-type", {}],
    ["json with a suffix", { "content-type": "application/jsonp" }],
  ])("refuses %s", (_, headers) => {
    expect(parseRemediateRequest(post(JSON.stringify({ repo: REPO, package: "x" }), headers)).ok).toBe(false);
  });

  it.each([
    ["a repeated key", `{"repo":"${REPO}","package":"a","package":"b"}`],
    ["an extra key", JSON.stringify({ repo: REPO, package: "a", branch: "main" })],
    ["a missing key", JSON.stringify({ repo: REPO })],
    ["a non-canonical URL", JSON.stringify({ repo: `${REPO}.git`, package: "a" })],
    ["an invalid name", JSON.stringify({ repo: REPO, package: "../x" })],
    ["a number", JSON.stringify({ repo: REPO, package: 1 })],
    ["an array", JSON.stringify([REPO, "a"])],
    ["not JSON", "{"],
    ["over 2 KiB", JSON.stringify({ repo: REPO, package: "a".repeat(2100) })],
  ])("answers 400 for %s", (_, body) => {
    expect(parseRemediateRequest(post(body))).toEqual({ ok: false, status: 400, code: "invalid-request" });
  });

  it("answers 400 for a query string or another path", () => {
    const body = JSON.stringify({ repo: REPO, package: "a" });
    expect(parseRemediateRequest(post(body, JSON_CT, { rawQueryString: "x=1" })).ok).toBe(false);
    expect(parseRemediateRequest(post(body, JSON_CT, { rawPath: "/api/scan" })).ok).toBe(false);
  });

  it("finds top-level keys only", () => {
    expect(topLevelKeys('{"a": {"b": 1, "c": [1, {"d": 2}]}, "e": "x,\\"f\\":"}')).toEqual(["a", "e"]);
    expect(topLevelKeys("[1]")).toBeNull();
    expect(topLevelKeys('x{"a":1}')).toBeNull();
  });
});

describe("allowlist (decision 1)", () => {
  it("parses owner/repo names lower-cased and drops anything else", () => {
    const allow = parseAllowlist(" HSiddhu2/Sexton-Demo ,bad,a/b/c,");
    expect([...allow]).toEqual(["hsiddhu2/sexton-demo"]);
    expect(isAllowed(allow, { owner: "hsiddhu2", repo: "SEXTON-demo" })).toBe(true);
    expect(isAllowed(allow, { owner: "hsiddhu2", repo: "sexton" })).toBe(false);
  });
  it("allows nothing when empty or missing", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
  });
});
