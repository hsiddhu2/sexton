// Upstream request logging. Spec: .kiro/specs/infra, Requirements 6.1 to 6.3. Property 11.

import fc from "fast-check";
import type { Transport, TransportRequest } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/log/logger.js";
import { upstreamFields, withRequestLogging } from "../../src/log/logging-transport.js";
import { arbCanary } from "../arbitraries.js";

const REQUEST: TransportRequest = { method: "GET", headers: { Accept: "application/json", Authorization: "HEADER-SECRET" } };

function harness(inner: Transport) {
  const lines: string[] = [];
  let now = 1000;
  const log = createLogger("cid", (line) => lines.push(line), () => new Date(0));
  const transport = withRequestLogging(inner, log, () => (now += 7));
  return { lines, transport };
}

describe("Feature: infra, Property 11: Upstream log lines carry no query and no body", () => {
  it("logs exactly the eight keys with the URL's host, and no query, fragment, header or body", async () => {
    await fc.assert(
      fc.asyncProperty(fc.webUrl(), arbCanary, fc.integer({ min: 100, max: 599 }), fc.boolean(), async (base, canary, status, throws) => {
        const url = `${base.split(/[?#]/)[0] ?? base}?q=${canary}Q#${canary}F`;
        const body = `${canary}B`;
        const inner: Transport = () =>
          throws ? Promise.reject(new Error(`${canary}E`)) : Promise.resolve({ status, json: () => Promise.resolve({ body }), text: () => Promise.resolve({ ok: true, text: body }) });
        const { lines, transport } = harness(inner);
        if (throws) await expect(transport(url, REQUEST)).rejects.toThrow(`${canary}E`);
        else expect((await transport(url, REQUEST)).status).toBe(status);
        expect(lines).toHaveLength(1);
        const line = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
        const keys = ["level", "time", "correlationId", "msg", "host", "path", "status", "latencyMs", ...(throws ? ["error"] : [])];
        expect(Object.keys(line).sort()).toEqual(keys.sort());
        expect(line["host"]).toBe(new URL(url).host);
        expect(line["status"]).toBe(throws ? 0 : status);
        expect(lines[0]).not.toContain(`${canary}Q`);
        expect(lines[0]).not.toContain(`${canary}F`);
        expect(lines[0]).not.toContain(`${canary}B`);
        expect(lines[0]).not.toContain(`${canary}E`);
        expect(lines[0]).not.toContain("HEADER-SECRET");
      }),
    );
  });
});

describe("Feature: infra, Property 11 (GitHub): no Owner or Repo in any GitHub log line", () => {
  it("holds for every GitHub host spelling, port, trailing slash or dot, and encoded slash", () => {
    const shapes = [
      (o: string, r: string) => `https://raw.githubusercontent.com/${o}/${r}/HEAD/package.json`,
      (o: string, r: string) => `https://raw.githubusercontent.com:8443/${o}/${r}/HEAD/package.json`,
      (o: string, r: string) => `https://raw.githubusercontent.com./${o}/${r}/HEAD/package.json`,
      (o: string, r: string) => `https://RAW.GITHUBUSERCONTENT.COM/${o}/${r}`,
      (o: string, r: string) => `https://raw.githubusercontent.com/${o}%2F${r}/HEAD`,
      (o: string, r: string) => `https://github.com/${o}/${r}`,
      (o: string, r: string) => `https://github.com/${o}/${r}/`,
      (o: string, r: string) => `https://GITHUB.COM:444/${o}/${r}/tree/main`,
      (o: string, r: string) => `https://github.com/${o}%2F${r}`,
      (o: string, r: string) => `https://api.github.com/repos/${o}/${r}`,
      (o: string, r: string) => `https://api.github.com./repos/${o}/${r}/contents/package.json`,
    ];
    fc.assert(
      fc.property(arbCanary, arbCanary, fc.constantFrom(...shapes), (owner, repo, shape) => {
        const text = JSON.stringify(upstreamFields(shape(`O${owner}`, `R${repo}`), 200, 1));
        expect(text).not.toContain(`O${owner}`);
        expect(text).not.toContain(`R${repo}`);
      }),
    );
  });
});

describe("withRequestLogging", () => {
  it("returns the inner response object unchanged and logs the latency", async () => {
    const response = { status: 200, json: () => Promise.resolve(1) };
    const { lines, transport } = harness(() => Promise.resolve(response));
    expect(await transport("https://registry.npmjs.org/express", REQUEST)).toBe(response);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ msg: "upstream", host: "registry.npmjs.org", path: "/express", status: 200, latencyMs: 7 });
  });

  it("rethrows the same error object and logs status 0 with the error name", async () => {
    const error = new TypeError("fetch failed");
    const { lines, transport } = harness(() => Promise.reject(error));
    await expect(transport("https://api.osv.dev/v1/querybatch", REQUEST)).rejects.toBe(error);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ level: "warn", status: 0, error: "TypeError" });
  });
});

describe("a failing log sink", () => {
  it("never loses the response or replaces the original error", async () => {
    const throwingLog = createLogger("cid", () => {
      throw new Error("sink down");
    });
    const response = { status: 200, json: () => Promise.resolve(1) };
    expect(await withRequestLogging(() => Promise.resolve(response), throwingLog)("https://h.example/", REQUEST)).toBe(response);
    const original = new Error("upstream");
    await expect(withRequestLogging(() => Promise.reject(original), throwingLog)("https://h.example/", REQUEST)).rejects.toBe(original);
  });

  it("keeps the original error when its name getter throws", async () => {
    const odd = new Error("odd");
    Object.defineProperty(odd, "name", { get: () => { throw new Error("getter"); } });
    const { lines, transport } = harness(() => Promise.reject(odd));
    await expect(transport("https://h.example/", REQUEST)).rejects.toBe(odd);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ status: 0, error: "Error" });
  });
});

describe("upstreamFields", () => {
  it("logs only the file path for raw GitHub, nothing for other GitHub hosts, and the full path elsewhere", () => {
    expect(upstreamFields("https://raw.githubusercontent.com/OwnerName/RepoName/HEAD/package-lock.json", 200, 1)).toEqual({
      msg: "upstream",
      host: "raw.githubusercontent.com",
      path: "package-lock.json",
      status: 200,
      latencyMs: 1,
    });
    expect(upstreamFields("https://raw.githubusercontent.com/OwnerName/RepoName/HEAD/sexton.policy.yml", 404, 1)["path"]).toBe("sexton.policy.yml");
    expect(upstreamFields("https://registry.npmjs.org/@scope%2fname", 200, 1)["path"]).toBe("/@scope%2fname");
  });

  it("cuts the path to 200 characters and logs nothing of an unparseable URL", () => {
    expect(upstreamFields(`https://h.example/${"a".repeat(300)}`, 200, 1)["path"]).toHaveLength(200);
    expect(upstreamFields("not a url SECRET", 0, 1)).toEqual({ msg: "upstream", host: "invalid-url", path: "", status: 0, latencyMs: 1 });
  });
});
