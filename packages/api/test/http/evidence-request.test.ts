// Spec: .kiro/specs/evidence-pack, Requirements 7.2, 7.7. Properties 41 and 42.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evidenceFileName } from "../../src/http/evidence-response.js";
import { parseEvidenceRequest } from "../../src/http/evidence-request.js";
import { arbOwner, arbRepo, arbValidRepoUrl } from "../arbitraries.js";
import { makeEvent } from "../support/events.js";

const URL_OK = "https://github.com/acme/app";
const q = (s: string) => makeEvent({ rawPath: "/api/evidence", rawQueryString: s });
const repo = `repo=${encodeURIComponent(URL_OK)}`;

describe("parseEvidenceRequest", () => {
  it.each([
    [repo, "json"],
    [`${repo}&format=json`, "json"],
    [`format=md&${repo}`, "md"],
  ])("accepts %s", (query, format) => {
    expect(parseEvidenceRequest(q(query))).toEqual({ ok: true, repoUrl: URL_OK, repo: { owner: "acme", repo: "app", url: URL_OK }, format });
  });

  it("returns the canonical URL, not the raw value", () => {
    const result = parseEvidenceRequest(q(`repo=${encodeURIComponent("https://github.com/acme/app.git")}`));
    expect(result.ok && result.repoUrl).toBe(URL_OK);
  });

  it.each([
    "",
    "format=json",
    `${repo}&${repo}`,
    `${repo}&format=json&format=md`,
    `${repo}&format=pdf`,
    `${repo}&format=JSON`,
    `${repo}&format=`,
    `${repo}&x=1`,
    `REPO=${encodeURIComponent(URL_OK)}`,
    `repo=${encodeURIComponent(`https://github.com/a/${"x".repeat(520)}`)}`,
  ])("rejects %s with 400 invalid-request", (query) => {
    expect(parseEvidenceRequest(q(query))).toEqual({ ok: false, status: 400, code: "invalid-request" });
  });

  it("rejects a bad URL with invalid-url, another path with invalid-request and another method with 405", () => {
    expect(parseEvidenceRequest(q("repo=https%3A%2F%2Fgitlab.com%2Fa%2Fb"))).toEqual({ ok: false, status: 400, code: "invalid-url" });
    expect(parseEvidenceRequest(makeEvent({ rawPath: "/api/evidence/", rawQueryString: repo }))).toEqual({ ok: false, status: 400, code: "invalid-request" });
    expect(parseEvidenceRequest(makeEvent({ rawPath: "/api/evidence", method: "POST", rawQueryString: repo }))).toEqual({ ok: false, status: 405, code: "method-not-allowed" });
  });
});

describe("Feature: evidence-pack, Property 42: The request parser rejects unknown and repeated parameters", () => {
  const arbName = fc.oneof(fc.constantFrom("x", "Repo", "FORMAT", "repo ", "", "commit"), fc.string({ maxLength: 8 }).filter((n) => n !== "repo" && n !== "format"));
  it("rejects any unknown name, repeated name or other format value", () => {
    fc.assert(
      fc.property(
        arbValidRepoUrl,
        fc.oneof(
          arbName.map((n) => [`${encodeURIComponent(n)}=1`]),
          fc.constant(["REPEAT_REPO"]),
          fc.constantFrom("json", "md").map((f) => [`format=${f}`, `format=${f}`]),
          fc.string({ maxLength: 6 }).filter((f) => f !== "json" && f !== "md").map((f) => [`format=${encodeURIComponent(f)}`]),
        ),
        fc.boolean(),
        (url, extra, first) => {
          const r = `repo=${encodeURIComponent(url)}`;
          const parts = extra.map((e) => (e === "REPEAT_REPO" ? r : e));
          const query = (first ? [...parts, r] : [r, ...parts]).join("&");
          expect(parseEvidenceRequest(q(query))).toEqual({ ok: false, status: 400, code: "invalid-request" });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("accepts any valid repository with format absent, json or md, in any order", () => {
    fc.assert(
      fc.property(arbValidRepoUrl, fc.constantFrom(undefined, "json", "md"), fc.boolean(), (url, format, first) => {
        const parts = [`repo=${encodeURIComponent(url)}`, ...(format === undefined ? [] : [`format=${format}`])];
        const result = parseEvidenceRequest(q((first ? parts.reverse() : parts).join("&")));
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.format).toBe(format ?? "json");
          expect(result.repoUrl).toBe(result.repo.url);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: evidence-pack, Property 41: Download file name", () => {
  it("holds only A-Z a-z 0-9 . - _ for any valid reference", () => {
    fc.assert(
      fc.property(arbOwner, arbRepo, fc.constantFrom("json" as const, "md" as const), (owner, name, format) => {
        expect(evidenceFileName({ owner, repo: name }, format)).toMatch(/^sexton-evidence-[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(json|md)$/);
      }),
      { numRuns: 1000 },
    );
  });

  it("filters any other character", () => {
    expect(evidenceFileName({ owner: 'a"b', repo: "c\r\nd/e" }, "md")).toBe("sexton-evidence-a_b-c__d_e.md");
  });
});
