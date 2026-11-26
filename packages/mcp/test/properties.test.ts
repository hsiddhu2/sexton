// Properties 1, 4 (end to end), 5, 6 and 8 through the server. Spec: .kiro/specs/sexton-power. 1000 runs where the spec says so.
import fc from "fast-check";
import type { PipelineResult } from "@sexton/cli";
import type { Transport, TransportResponse } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { arbPackage } from "../../engine/test/arbitraries.js";
import { ERROR_CODES, ERROR_MESSAGES, DATA_HEADER, ok, type ErrorCode } from "../src/result.js";
import { checkView } from "../src/views/check-view.js";
import { explainView } from "../src/views/explain-view.js";
import { fixOrderView } from "../src/views/fix-order-view.js";
import { scanView } from "../src/views/scan-view.js";
import { REMOVED, hostileString } from "./bound.test.js";
import { appFiles, harness, ROOT, type Node } from "./support.js";

const TOOLS = ["scan_project", "explain_package", "fix_order", "check_policy"] as const;
const ALIAS_NODES: Record<string, Node> = { "/work/alias": { link: "/work/app" }, "/work/nopkg": "dir", "/work/a.txt": "file" };

function tmpl(project: boolean, lock: boolean, policy: "none" | "valid" | "invalid"): Record<string, string> {
  const files = appFiles();
  const out: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith("package.json") && !project) continue;
    if (path.endsWith("package-lock.json") && !lock) continue;
    out[path] = text;
  }
  if (policy === "valid") out[`${ROOT}/sexton.policy.yml`] = "version: 1\nrules: []\n";
  if (policy === "invalid") out[`${ROOT}/sexton.policy.yml`] = "version: 99\nrules: nope\n";
  return out;
}

describe("Property 1: the project is never changed", () => {
  it("for any project shape and any sequence of up to 10 calls with any arguments, nothing is written", async () => {
    const args = fc.oneof(
      fc.constant({ projectDir: ROOT }),
      fc.constant({ projectDir: ROOT, package: "left-pad" }),
      fc.constant({ projectDir: "/work/alias" }),
      fc.jsonValue(),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), fc.boolean(), fc.constantFrom("none", "valid", "invalid"),
        fc.array(fc.record({ tool: fc.constantFrom(...TOOLS), args }), { minLength: 1, maxLength: 10 }),
        async (project, lock, policy, calls) => {
          const projectFiles = tmpl(project, lock, policy);
          const before = JSON.stringify(projectFiles);
          const h = await harness({ projectFiles, nodes: ALIAS_NODES });
          for (const c of calls) await h.client.callTool(c.tool, c.args);
          // The counter sits on the port the pipeline sees, outside readOnlyFiles, so a pipeline that wrote would be counted.
          expect(h.writes.count).toBe(0);
          expect(h.captured.writes.size).toBe(0);
          expect(JSON.stringify(projectFiles)).toBe(before);
        },
      ),
      { numRuns: 1000 },
    );
  }, 120_000);
});

describe("Property 4 end to end: hostile text is bounded", () => {
  const big = fc.oneof({ weight: 60, arbitrary: hostileString }, { weight: 1, arbitrary: fc.constant("\u202E# heading\n".repeat(80_000)) });
  const severity = fc.constantFrom("Critical", "High", "Moderate", "Low", "Unknown");
  const scanArb = fc.array(
    fc.record({ base: arbPackage, name: big, version: big, reason: big, source: big, fetched: big, summary: big, id: big, advisorySeverity: severity, title: big, body: big, range: big, ruleReason: big }),
    { maxLength: 8 },
  );
  it("any Unicode strings, up to 1 MiB, in every outside field, give bounded results", () => {
    fc.assert(
      fc.property(scanArb, big, (rows, ruleName) => {
        const packages = rows.map((r) => ({
          ...r.base,
          name: r.name,
          installedVersion: r.version,
          stateReason: r.reason,
          signals: Object.fromEntries(
            Object.entries(r.base.signals).map(([k, s]) => [
              k,
              k === "advisories"
                ? { available: true, value: [{ id: r.id, severity: r.advisorySeverity, summary: r.summary }], source: r.source, fetchedAt: r.fetched }
                : s.available
                  ? { ...s, source: r.source, fetchedAt: r.fetched, value: k === "maintainers" ? [r.summary] : s.value }
                  : { ...s, source: r.source, fetchedAt: r.fetched, reason: r.reason },
            ]),
          ),
        }));
        const scan = {
          ok: true,
          report: { generatedAt: rows[0]?.fetched ?? "2026-11-12T00:00:00Z", packages },
          policy: {
            source: "file",
            pass: false,
            rules: [{ index: 0, type: "forbid_state", name: ruleName, pass: false, failures: rows.map((r) => ({ name: r.name, installedVersion: r.version, reason: r.ruleReason })), unevaluated: [], notFound: rows.map((r) => r.name) }],
          },
          remediations: rows.map((r) => ({ packageName: r.name, kind: "bump", status: "proposed", title: r.title, summary: r.title, prBody: r.body, chosenVersion: r.version })),
          dependencies: rows.map((r) => ({ name: r.name, installedVersion: r.version, declaredRange: r.range, origin: "dependencies", resolution: "locked" })),
        } as unknown as PipelineResult;
        const objects: Record<string, unknown>[] = [scanView(scan), fixOrderView(scan), checkView(scan), ...rows.map((r) => explainView(scan, r.name)).filter((v): v is Record<string, unknown> => v !== null)];
        for (const object of objects) {
          const result = ok(object);
          const text = result.content[0]?.text ?? "";
          expect(text.startsWith(`${DATA_HEADER}\n`)).toBe(true);
          expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(100 * 1024);
          const parsed = JSON.parse(text.slice(DATA_HEADER.length + 1)) as unknown;
          const walk = (node: unknown): void => {
            if (typeof node === "string") {
              expect(REMOVED.test(node)).toBe(false);
              expect(Array.from(node).length).toBeLessThanOrEqual(4000);
            } else if (Array.isArray(node)) node.forEach(walk);
            else if (typeof node === "object" && node !== null) {
              for (const [k, v] of Object.entries(node)) {
                expect(/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)).toBe(true);
                walk(v);
              }
            }
          };
          walk(parsed);
          const list = (parsed as { packages?: unknown[] }).packages;
          if (list !== undefined) expect(list.length).toBeLessThanOrEqual(300);
          for (const key of ["failures", "notFound"]) {
            for (const rule of (parsed as { rules?: Record<string, unknown[]>[] }).rules ?? []) expect((rule[key] ?? []).length).toBeLessThanOrEqual(20);
          }
        }
      }),
      { numRuns: 1000 },
    );
  }, 300_000);
});

describe("Property 5: errors are data", () => {
  const response = (body: string): TransportResponse => ({ status: 200, json: () => Promise.resolve(JSON.parse(body) as unknown) });
  const transportArb = fc.constantFrom<"ok" | "reject" | "garbage" | "empty">("ok", "reject", "garbage", "empty");
  const fileMode = fc.constantFrom<"normal" | "missing" | "too-large" | "invalid" | "throws">("normal", "missing", "too-large", "invalid", "throws");
  it("for any arguments and any failing ports, every tool resolves, and an error is a fixed message with no leak", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TOOLS), fc.oneof(fc.jsonValue(), fc.constant({ projectDir: ROOT, package: "left-pad" }), fc.constant({ projectDir: ROOT })),
        fileMode, fc.boolean(), transportArb,
        async (tool, args, mode, gitThrows, transportMode) => {
          const h = await harness({
            cli: (cli) => ({
              ...cli,
              files: {
                ...cli.files,
                readRoot: async (root, name, max) => {
                  if (mode === "throws" && name === "package-lock.json") throw new Error(`secret ${root}`);
                  if (mode === "missing" && name === "package.json") return { kind: "missing" };
                  if (mode === "too-large" && name === "package-lock.json") return { kind: "too-large" };
                  if (mode === "invalid" && name === "sexton.policy.yml") return { kind: "invalid" };
                  return cli.files.readRoot(root, name, max);
                },
              },
              git: { ...cli.git, originUrl: () => (gitThrows ? Promise.reject(new Error("boom /secret")) : cli.git.originUrl("")) },
              transport: ((url, request): Promise<TransportResponse> => {
                if (transportMode === "reject") return Promise.reject(new Error("down https://registry.npmjs.org/x"));
                if (transportMode === "garbage") return Promise.resolve(response("[1,2,3]"));
                if (transportMode === "empty") return Promise.resolve(response("{}"));
                return cli.transport(url, request);
              }) as Transport,
            }),
          });
          const out = await h.client.callTool(tool, args);
          if (out.rpcError !== undefined) {
            // The protocol layer refuses arguments that are not an object before the tool runs. It is still data: a code and a short message.
            expect(typeof args === "object" && args !== null && !Array.isArray(args)).toBe(false);
            expect(out.rpcError.code).toBe(-32602);
            expect(out.rpcError.message).not.toMatch(/\n\s+at /);
            return;
          }
          expect(out.text.length).toBeGreaterThan(0);
          if (out.isError) {
            const error = out.json["error"] as { code: ErrorCode; message: string; errors?: unknown };
            expect(ERROR_CODES).toContain(error.code);
            expect(error.message).toBe(ERROR_MESSAGES[error.code]);
            expect(out.text).not.toMatch(/\n\s+at /);
            expect(out.text).not.toContain(ROOT);
            expect(out.text).not.toContain("secret");
            expect(out.text).not.toMatch(/https?:\/\//);
          } else {
            expect(out.json["ok"]).toBe(true);
          }
        },
      ),
      { numRuns: 1000 },
    );
  }, 300_000);
  it("an unexpected exception becomes internal-error with the fixed message and a log of its name only", async () => {
    const h = await harness({
      cli: (cli) => ({ ...cli, files: { ...cli.files, readRoot: () => Promise.reject(new TypeError("leaky /private/path")) } }),
    });
    const out = await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(out.json).toEqual({ ok: false, error: { code: "internal-error", message: "Sexton could not finish this request." } });
    expect(h.logs).toEqual(["sexton-mcp: internal-error scan_project TypeError"]);
  });
});

describe("Property 6: the project directory is bounded", () => {
  const segment = fc.constantFrom("work", "app", "alias", "nopkg", "..", ".", "a.txt", "nowhere", "");
  const dir = fc.oneof(fc.array(segment, { maxLength: 6 }).map((s) => `/${s.join("/")}`), fc.string({ maxLength: 30 }), fc.constantFrom(ROOT, "/work/alias", "/work/nopkg/../app", "/work/app/"));
  it("accepts only an existing project directory, reads only under its real path, and echoes nothing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...TOOLS), dir, fc.option(fc.constantFrom("path", "dir", "cwd", "repo", "url", "root"), { nil: undefined }), async (tool, projectDir, extra) => {
        const roots: string[] = [];
        const h = await harness({
          nodes: ALIAS_NODES,
          cli: (cli) => ({ ...cli, files: { ...cli.files, readRoot: (root, name, max) => (roots.push(root), cli.files.readRoot(root, name, max)) } }),
        });
        const args: Record<string, unknown> = { projectDir, ...(tool === "explain_package" ? { package: "left-pad" } : {}), ...(extra === undefined ? {} : { [extra]: "/" }) };
        const out = await h.client.callTool(tool, args);
        const valid = extra === undefined && ["/work/app", "/work/alias", "/work/nopkg/../app", "/work/app/"].includes(projectDir);
        if (!valid) {
          if (extra !== undefined) expect((out.json["error"] as { code: string }).code).toBe("invalid-arguments");
          expect(out.isError || out.json["ok"] === true).toBe(true);
          if (out.isError && ["invalid-arguments", "project-dir-not-absolute", "project-dir-not-found", "project-dir-not-a-directory", "package-json-missing"].includes((out.json["error"] as { code: string }).code)) {
            expect(roots).toEqual([]);
            expect(h.captured.calls.network).toBe(0);
          }
        } else {
          expect(roots.length).toBeGreaterThan(0);
          for (const r of roots) expect(r).toBe("/work/app");
        }
        expect(out.text).not.toContain(ROOT);
        if (projectDir.includes("/") && projectDir.length > 3 && !out.json["ok"]) expect(out.text).not.toContain(projectDir);
      }),
      { numRuns: 1000 },
    );
  }, 300_000);
});

describe("Property 8: an unknown package costs nothing", () => {
  it("for any valid name that is not a dependency, package-not-in-scan and no new request", async () => {
    const h = await harness();
    await h.client.callTool("scan_project", { projectDir: ROOT });
    const before = h.captured.calls.network;
    const known = new Set((((await h.client.callTool("scan_project", { projectDir: ROOT })).json["packages"]) as { name: string }[]).map((p) => p.name));
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^(@[a-z0-9-]{1,10}\/)?[a-z0-9][a-z0-9._-]{0,30}$/).filter((n) => !known.has(n)), async (name) => {
        const out = await h.client.callTool("explain_package", { projectDir: ROOT, package: name });
        expect((out.json["error"] as { code: string }).code).toBe("package-not-in-scan");
        expect(h.captured.calls.network).toBe(before);
      }),
      { numRuns: 200 },
    );
  });
});
