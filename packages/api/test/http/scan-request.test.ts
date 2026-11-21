// Request validation. Spec: .kiro/specs/infra, Requirements 4.1 to 4.3. Property 9, parser half.

import fc from "fast-check";
import { formatRepoUrl, parseRepoUrl } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { MAX_REPO_PARAM_LENGTH, parseScanRequest } from "../../src/http/scan-request.js";
import { arbEvent } from "../arbitraries.js";
import { makeEvent, repoQuery } from "../support/events.js";

describe("Feature: infra, Property 9: Request validation is exclusive (parser)", () => {
  it("accepts exactly a GET of /api/scan with one valid repo parameter, and returns its Canonical URL", () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const result = parseScanRequest(event);
        const entries = [...new URLSearchParams(event.rawQueryString).entries()];
        const value = entries.length === 1 && entries[0]?.[0] === "repo" ? entries[0][1] : undefined;
        const parsed = value === undefined ? undefined : parseRepoUrl(value);
        const valid = event.requestContext.http.method === "GET" && event.rawPath === "/api/scan" && value !== undefined && value.length <= MAX_REPO_PARAM_LENGTH && parsed?.ok === true;
        expect(result.ok).toBe(valid);
        if (result.ok && parsed?.ok === true) expect(result.repoUrl).toBe(formatRepoUrl(parsed.repo));
        if (!result.ok) expect(result.status).toBe(event.requestContext.http.method === "GET" ? 400 : 405);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("parseScanRequest examples", () => {
  const ok = repoQuery("https://github.com/expressjs/express");

  it("returns the Canonical URL, never the raw value", () => {
    expect(parseScanRequest(makeEvent({ rawQueryString: repoQuery("https://github.com/expressjs/express.git") }))).toEqual({ ok: true, repoUrl: "https://github.com/expressjs/express" });
    expect(parseScanRequest(makeEvent({ rawQueryString: repoQuery("https://github.com/a/b/tree/main") }))).toEqual({ ok: true, repoUrl: "https://github.com/a/b" });
  });

  it("answers 405 for any method other than GET", () => {
    for (const method of ["POST", "PUT", "HEAD", "OPTIONS", "get"]) {
      expect(parseScanRequest(makeEvent({ method, rawQueryString: ok }))).toEqual({ ok: false, status: 405, code: "method-not-allowed" });
    }
  });

  it("answers 400 invalid-request for another path, a missing, repeated or extra parameter, or 513 characters", () => {
    const invalid = { ok: false, status: 400, code: "invalid-request" };
    expect(parseScanRequest(makeEvent({ rawPath: "/api/scan/x", rawQueryString: ok }))).toEqual(invalid);
    expect(parseScanRequest(makeEvent({ rawPath: "/api/scan/", rawQueryString: ok }))).toEqual(invalid);
    expect(parseScanRequest(makeEvent({ rawQueryString: "" }))).toEqual(invalid);
    expect(parseScanRequest(makeEvent({ rawQueryString: `${ok}&${ok}` }))).toEqual(invalid);
    expect(parseScanRequest(makeEvent({ rawQueryString: `${ok}&x=1` }))).toEqual(invalid);
    expect(parseScanRequest(makeEvent({ rawQueryString: "x=1" }))).toEqual(invalid);
    const long = `https://github.com/a/${"b".repeat(MAX_REPO_PARAM_LENGTH - "https://github.com/a/".length + 1)}`;
    expect(long).toHaveLength(513);
    expect(parseScanRequest(makeEvent({ rawQueryString: repoQuery(long) }))).toEqual(invalid);
  });

  it("answers 400 invalid-url for a value parseRepoUrl rejects", () => {
    for (const url of ["http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com/a", "", "https://github.com/orgs/x"]) {
      expect(parseScanRequest(makeEvent({ rawQueryString: repoQuery(url) }))).toEqual({ ok: false, status: 400, code: "invalid-url" });
    }
  });

  it("reads no header and no cookie", () => {
    const event = makeEvent({ rawQueryString: ok, headers: { cookie: "a=b", "x-forwarded-for": "1.2.3.4" } });
    expect(parseScanRequest(event)).toEqual(parseScanRequest(makeEvent({ rawQueryString: ok })));
  });
});
