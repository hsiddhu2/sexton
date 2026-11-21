import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkScanUrl } from "../src/load/check-scan-url.js";

const PAGE = "https://sexton.example";
const API = "https://api.sexton.example";

describe("checkScanUrl examples", () => {
  it("accepts same-origin forms", () => {
    expect(checkScanUrl("/demo/scan.json", PAGE, null)).toEqual({ ok: true, url: "https://sexton.example/demo/scan.json" });
    expect(checkScanUrl("scan.json", PAGE, null).ok).toBe(true);
    expect(checkScanUrl("https://sexton.example/x.json", PAGE, null).ok).toBe(true);
    expect(checkScanUrl("http://localhost:5173/x.json", "http://localhost:5173", null).ok).toBe(true);
  });
  it("accepts https on the API origin only when configured", () => {
    expect(checkScanUrl(`${API}/scan?repo=a`, PAGE, API).ok).toBe(true);
    expect(checkScanUrl(`${API}/scan?repo=a`, PAGE, null).ok).toBe(false);
  });
  it.each([
    "",
    "http://[",
    "javascript:alert(1)",
    "data:text/html,x",
    "blob:https://sexton.example/b",
    "file:///etc/passwd",
    "//evil.example/x",
    "\\\\evil.example\\x",
    "http://api.sexton.example/x",
    "https://evil.example/x",
    "https://user:pw@sexton.example/x",
    "https://api.sexton.example:8443/x",
  ])("rejects %j", (input) => {
    expect(checkScanUrl(input, PAGE, API).ok).toBe(false);
  });
});

function oracle(input: string, pageOrigin: string, api: string | null): boolean {
  if (input === "") return false;
  let u: URL;
  try {
    u = new URL(input, new URL(pageOrigin).origin + "/");
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username !== "" || u.password !== "") return false;
  if (u.origin === new URL(pageOrigin).origin) return true;
  return u.protocol === "https:" && api !== null && u.origin === new URL(api).origin;
}

const arbPage = fc.constantFrom("https://sexton.example", "http://localhost:5173");
const arbApi = fc.option(fc.constantFrom("https://api.sexton.example", "https://api.sexton.example:8443"), { nil: null });

const nearMiss = fc.constantFrom(
  "https://api.sexton.example./scan",
  "https://API.sexton.example/scan",
  "https://api.sexton.example:444/scan",
  "http://api.sexton.example/scan",
  "https://api.sexton.example@evil.example/scan",
  "https://user@api.sexton.example/scan",
  "https://sexton.example.evil.example/x",
  "HTTPS://SEXTON.EXAMPLE/x",
  "http://sexton.example/x",
  "https://sexton.example:443/x",
);

const arbInput = fc.oneof(
  fc.string(),
  fc.webUrl(),
  fc.constantFrom(
    "//evil.example/x",
    "\\\\evil.example\\x",
    "https://user:pw@host/x",
    "javascript:alert(1)",
    "data:text/html,x",
    "blob:https://a/b",
    "file:///etc/passwd",
    "/demo/scan.json",
    "scan.json",
  ),
  nearMiss,
);

describe("checkScanUrl properties", () => {
  it(
    "Feature: cemetery-ui, Property 11: checkScanUrl accepts only same-origin or https API-origin URLs",
    () => {
      fc.assert(
        fc.property(arbInput, arbPage, arbApi, (input, page, api) => {
          const a = checkScanUrl(input, page, api);
          const b = checkScanUrl(input, page, api);
          expect(a).toEqual(b);
          expect(a.ok).toBe(oracle(input, page, api));
          if (a.ok) {
            const u = new URL(a.url);
            expect(u.username + u.password).toBe("");
            expect(["http:", "https:"]).toContain(u.protocol);
            const sameOrigin = u.origin === new URL(page).origin;
            const apiOrigin = api !== null && u.protocol === "https:" && u.origin === new URL(api).origin;
            expect(sameOrigin || apiOrigin).toBe(true);
          }
        }),
        { numRuns: 1000 },
      );
    },
    60000,
  );
});
