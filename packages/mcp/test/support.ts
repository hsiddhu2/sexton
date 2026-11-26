// Test support for the MCP server: an in-memory file system for the project directory check, a tiny client over the
// SDK's in-memory transport, and server deps built from the CLI's fakes and the Engine's recorded fixtures. No network.
import { InMemoryTransport, type McpServer } from "@modelcontextprotocol/server";
import { posix } from "node:path";
import type { CliDeps } from "@sexton/cli";
import { appFiles, fakeDeps, ROOT, type Captured, type FakeOptions } from "../../cli/test/support.js";
import { createServer, type McpDeps } from "../src/server.js";
import { readOnlyFiles } from "../src/read-only-files.js";
import type { PathStat, ProjectFs } from "../src/project-dir.js";

export { appFiles, fakeDeps, ROOT };

export type Node = "dir" | "file" | { readonly link: string };

/** An in-memory ProjectFs over a map of absolute path to node. Records every path it is asked about. */
export function memoryFs(tree: Record<string, Node>): ProjectFs & { readonly asked: string[] } {
  const asked: string[] = [];
  const enoent = (): Error => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const stat = (n: Node): PathStat => ({ isDirectory: () => n === "dir", isFile: () => n === "file" });
  function real(path: string): string {
    const parts = posix.normalize(path).split("/").filter((p) => p !== "");
    let current = "";
    for (const part of parts) {
      current = `${current}/${part}`;
      for (let hops = 0; hops < 20; hops += 1) {
        const node = tree[current];
        if (node === undefined) throw enoent();
        if (typeof node === "object") current = posix.resolve(posix.dirname(current), node.link);
        else break;
      }
    }
    return current === "" ? "/" : current;
  }
  return {
    asked,
    realpath: (p) => {
      asked.push(p);
      try {
        return Promise.resolve(real(p));
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : enoent());
      }
    },
    stat: (p) => {
      asked.push(p);
      const node = tree[p];
      return node === undefined ? Promise.reject(enoent()) : Promise.resolve(stat(typeof node === "object" ? (tree[real(p)] ?? "file") : node));
    },
    lstat: (p) => {
      asked.push(p);
      const node = tree[p];
      return node === undefined ? Promise.reject(enoent()) : Promise.resolve(stat(node));
    },
  };
}

/** The directory tree implied by a map of file paths (every parent is a dir). */
export function treeOf(files: Record<string, string>, extra: Record<string, Node> = {}): Record<string, Node> {
  const tree: Record<string, Node> = {};
  for (const path of Object.keys(files)) {
    tree[path] = "file";
    let dir = posix.dirname(path);
    while (dir !== "/" && dir !== ".") {
      tree[dir] = "dir";
      dir = posix.dirname(dir);
    }
  }
  return { ...tree, ...extra };
}

export interface Harness {
  readonly server: McpServer;
  readonly captured: Captured;
  readonly fs: ReturnType<typeof memoryFs>;
  readonly logs: string[];
  readonly client: Client;
  readonly deps: McpDeps;
}

export interface Client {
  request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  callTool(name: string, args: unknown): Promise<ToolOut>;
  close(): Promise<void>;
}
export interface ToolOut {
  readonly isError: boolean;
  readonly text: string;
  readonly json: Record<string, unknown>;
  readonly structured: Record<string, unknown>;
  /** Set when the protocol layer refused the call before the tool ran (arguments that are not an object). */
  readonly rpcError?: { readonly code: number; readonly message: string };
}

export async function connect(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (message: Record<string, unknown>) => void>();
  clientSide.onmessage = (message) => {
    const m = message as unknown as Record<string, unknown>;
    const id = m["id"];
    if (typeof id === "number") pending.get(id)?.(m);
  };
  await server.connect(serverSide);
  await clientSide.start();
  let next = 1;
  const request = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      const id = next++;
      pending.set(id, resolve);
      void clientSide.send({ jsonrpc: "2.0", id, method, params } as never);
    });
  const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  if (init["error"] !== undefined) throw new Error("initialize failed");
  await clientSide.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
  return {
    request,
    close: () => clientSide.close(),
    callTool: async (name, args) => {
      const response = await request("tools/call", { name, arguments: args });
      const rpc = response["error"] as { code: number; message: string } | undefined;
      if (rpc !== undefined) return { isError: true, text: "", json: {}, structured: {}, rpcError: rpc };
      const result = (response["result"] ?? {}) as { isError?: boolean; content?: { text: string }[]; structuredContent?: Record<string, unknown> };
      const text = result.content?.[0]?.text ?? "";
      const body = text.slice(text.indexOf("\n") + 1);
      const json = ((): Record<string, unknown> => {
        try {
          return JSON.parse(body) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      return { isError: result.isError === true, text, json, structured: result.structuredContent ?? {} };
    },
  };
}

export interface HarnessOptions extends FakeOptions {
  readonly tree?: Record<string, string>;
  readonly projectFiles?: Record<string, string>;
  readonly nodes?: Record<string, Node>;
  readonly scanTimeoutMs?: number;
  readonly now?: () => number;
  readonly cli?: (deps: CliDeps) => CliDeps;
}

/** A server over fakes. The default project is /work/app with the fixture packages. */
export async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const files = options.projectFiles ?? appFiles();
  const captured = fakeDeps({ ...options, files: { ...files, ...(options.files ?? {}) } });
  const fs = memoryFs(treeOf(files, options.nodes));
  const logs: string[] = [];
  let cli: CliDeps = { ...captured.deps, files: readOnlyFiles(captured.deps.files) };
  if (options.cli !== undefined) cli = options.cli(cli);
  const deps: McpDeps = { cli, fs, scanTimeoutMs: options.scanTimeoutMs ?? 30_000, cacheTtlMs: 900_000, now: options.now ?? (() => 0), log: (l) => void logs.push(l) };
  const server = createServer(deps);
  return { server, captured, fs, logs, client: await connect(server), deps };
}
