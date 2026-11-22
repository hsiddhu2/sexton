// An in-memory GitHub for the remediate tests. Spec: .kiro/specs/remediate, Testing Strategy. No network.
// Answers the eight Write shapes and the two Read shapes of spec hosted-plans for one repository; every other
// api.github.com request answers 404 and is recorded as unexpected. Other hosts go to the fallback transport.

import type { Transport, TransportRequest, TransportResponse } from "@sexton/engine";

export interface FakeGithubOptions {
  readonly owner: string;
  readonly repo: string;
  readonly commit: string;
  readonly defaultBranch?: string;
  /** package.json text at the commit. */
  readonly packageJson: string;
  /** Blob paths of the tree at the commit. */
  readonly tree?: readonly string[];
  /** Refs that exist before the run, full names such as refs/heads/sexton/bump-x. */
  readonly refs?: readonly string[];
  /** Open pull requests that exist before the run, by head branch. */
  readonly openPulls?: readonly string[];
  /** Overrides a status by request kind, for failure runs. */
  readonly statuses?: Partial<Record<FakeKind, number>>;
  /** Overrides the html_url GitHub answers for a new pull request. */
  readonly htmlUrl?: (number: number) => string;
}

export type FakeKind =
  | "commit"
  | "tree"
  | "get-repo"
  | "list-sexton-refs"
  | "list-pulls"
  | "get-package-json"
  | "create-ref"
  | "put-package-json"
  | "create-pull"
  | "create-comment";

export interface Sent {
  readonly url: string;
  readonly request: TransportRequest;
  readonly kind: FakeKind | "unexpected" | "other";
}

export interface FakeGithub {
  readonly transport: Transport;
  readonly sent: Sent[];
  readonly refs: Set<string>;
  readonly files: Map<string, string>;
  readonly pulls: { number: number; head: string; base: string; title: string; body: string; state: string }[];
  readonly comments: { number: number; body: string }[];
}

const BLOB = "b".repeat(40);

function respond(status: number, value: unknown): TransportResponse {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return {
    status,
    json: () => Promise.resolve(JSON.parse(text) as unknown),
    text: (limit: number) => Promise.resolve(Buffer.byteLength(text) > limit ? { ok: false, reason: "too-large" } : { ok: true, text }),
  };
}

export function fakeGithub(options: FakeGithubOptions, fallback: Transport): FakeGithub {
  const base = `https://api.github.com/repos/${options.owner}/${options.repo}`;
  const refs = new Set(options.refs ?? []);
  const files = new Map<string, string>();
  const pulls: FakeGithub["pulls"] = (options.openPulls ?? []).map((head, i) => ({ number: i + 1, head, base: "main", title: "", body: "", state: "open" }));
  const comments: FakeGithub["comments"] = [];
  const sent: Sent[] = [];
  const defaultBranch = options.defaultBranch ?? "main";
  const htmlUrl = options.htmlUrl ?? ((n: number) => `https://github.com/${options.owner}/${options.repo}/pull/${String(n)}`);

  const kindOf = (url: string, method: string): FakeKind | "unexpected" => {
    const path = url.slice(base.length);
    if (!url.startsWith(base)) return "unexpected";
    if (method === "GET" && path === "/commits/HEAD") return "commit";
    if (method === "GET" && path === `/git/trees/${options.commit}?recursive=1`) return "tree";
    if (method === "GET" && path === "") return "get-repo";
    if (method === "GET" && path === "/git/matching-refs/heads/sexton/") return "list-sexton-refs";
    if (method === "GET" && path.startsWith("/pulls?head=")) return "list-pulls";
    if (method === "GET" && path === `/contents/package.json?ref=${options.commit}`) return "get-package-json";
    if (method === "POST" && path === "/git/refs") return "create-ref";
    if (method === "PUT" && path === "/contents/package.json") return "put-package-json";
    if (method === "POST" && path === "/pulls") return "create-pull";
    if (method === "POST" && /^\/issues\/\d+\/comments$/.test(path)) return "create-comment";
    return "unexpected";
  };

  const transport: Transport = (url, request) => {
    if (!url.startsWith("https://api.github.com/")) {
      sent.push({ url, request, kind: "other" });
      return fallback(url, request);
    }
    const kind = kindOf(url, request.method);
    sent.push({ url, request, kind });
    const forced = kind === "unexpected" ? undefined : options.statuses?.[kind];
    if (forced !== undefined) return Promise.resolve(respond(forced, { message: "forced" }));
    const body = request.body === undefined ? {} : (JSON.parse(request.body) as Record<string, unknown>);
    switch (kind) {
      case "commit":
        return Promise.resolve(respond(200, options.commit));
      case "tree":
        return Promise.resolve(respond(200, { sha: options.commit, truncated: false, tree: (options.tree ?? ["package.json"]).map((path) => ({ path, type: "blob" })) }));
      case "get-repo":
        return Promise.resolve(respond(200, { default_branch: defaultBranch, full_name: `${options.owner}/${options.repo}` }));
      case "list-sexton-refs":
        return Promise.resolve(respond(200, [...refs].filter((r) => r.startsWith("refs/heads/sexton/")).map((ref) => ({ ref, object: { sha: options.commit } }))));
      case "list-pulls": {
        const head = decodeURIComponent(new URL(url).searchParams.get("head") ?? "").split(":").slice(1).join(":");
        return Promise.resolve(
          respond(
            200,
            pulls.filter((p) => p.head === head).map((p) => ({ number: p.number, state: p.state, head: { ref: p.head }, html_url: htmlUrl(p.number) })),
          ),
        );
      }
      case "get-package-json":
        return Promise.resolve(respond(200, { encoding: "base64", content: Buffer.from(options.packageJson, "utf8").toString("base64"), sha: BLOB }));
      case "create-ref": {
        const ref = String(body["ref"]);
        if (refs.has(ref)) return Promise.resolve(respond(422, { message: "Reference already exists" }));
        refs.add(ref);
        return Promise.resolve(respond(201, { ref }));
      }
      case "put-package-json":
        files.set(String(body["branch"]), Buffer.from(String(body["content"]), "base64").toString("utf8"));
        return Promise.resolve(respond(200, { content: { sha: "c".repeat(40) } }));
      case "create-pull": {
        const number = pulls.length + 1;
        pulls.push({ number, head: String(body["head"]), base: String(body["base"]), title: String(body["title"]), body: String(body["body"]), state: "open" });
        return Promise.resolve(respond(201, { number, html_url: htmlUrl(number), state: "open" }));
      }
      case "create-comment": {
        const number = Number(/issues\/(\d+)\/comments/.exec(url)?.[1]);
        comments.push({ number, body: String(body["body"]) });
        return Promise.resolve(respond(201, { id: comments.length }));
      }
      default:
        return Promise.resolve(respond(404, { message: "Not Found" }));
    }
  };
  return { transport, sent, refs, files, pulls, comments };
}
