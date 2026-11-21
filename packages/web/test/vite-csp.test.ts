import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseApiBase } from "../src/load/api-base.js";
import { apiOrigin, cspPlugin } from "../vite.config.js";

const PATTERN = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/;

function cspFor(raw: string | undefined): string {
  const plugin = cspPlugin(raw);
  const hook = plugin.transformIndexHtml as (html: string) => string;
  const html = hook("<!-- sexton:csp -->");
  const m = /content="([^"]*)"/.exec(html);
  return m?.[1] ?? "";
}

const arbHost = fc
  .array(fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/), { minLength: 1, maxLength: 3 })
  .map((labels) => labels.join("."));
const arbHttps = fc
  .tuple(arbHost, fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }), fc.constantFrom("", "/", "/v1", "/v1/"))
  .map(([host, port, path]) => `https://${host}${port === undefined ? "" : `:${String(port)}`}${path}`);
const arbTokens = fc
  .array(fc.constantFrom("/", "//", "..", ".", "?", "#", "\\", " ", "%2e", "api", "v1", "https://", "[::1]", "@"), { maxLength: 8 })
  .map((parts) => parts.join(""));

describe("vite CSP origin", () => {
  it(
    "Feature: cemetery-theme, Property 11: CSP origin",
    () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.webUrl(), arbTokens, arbHttps), (raw) => {
          const out = apiOrigin(raw);
          if (out !== null) expect(out).toMatch(PATTERN);
          const base = parseApiBase(raw);
          if (base !== null && base.startsWith("/")) expect(out).toBeNull();
        }),
        { numRuns: 1000 },
      );
      fc.assert(
        fc.property(arbHttps, (raw) => {
          expect(apiOrigin(raw)).toBe(new URL(raw).origin);
        }),
        { numRuns: 1000 },
      );
    },
    60000,
  );

  it("returns origins for valid https values and null otherwise", () => {
    expect(apiOrigin("https://api.sexton.example")).toBe("https://api.sexton.example");
    expect(apiOrigin("https://api.sexton.example:8443/v1")).toBe("https://api.sexton.example:8443");
    expect(apiOrigin("/api")).toBeNull();
    expect(apiOrigin("https://[::1]")).toBeNull();
    expect(apiOrigin("https://user:pw@api.example")).toBeNull();
  });

  it("builds connect-src from the origin", () => {
    expect(cspFor("/api")).toContain("connect-src 'self'; ");
    expect(cspFor("/api")).not.toContain("https:");
    expect(cspFor("https://api.sexton.example")).toContain("connect-src 'self' https://api.sexton.example; ");
  });
});
