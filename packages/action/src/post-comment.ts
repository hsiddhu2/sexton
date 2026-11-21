// Posts or updates the Sexton check comment on a pull request. Spec: .kiro/specs/cli-and-action, Requirements 9.5 to 9.9.
// Runs only for pull_request with comment "true". A failure is a warning and exit 0: a fork pull request has a read-only
// token. The token comes from env, goes only into the Authorization header for api.github.com, and is never printed.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { API_VERSION, postOrUpdate, targetFrom, USER_AGENT_VALUE, type ApiRequest, type Response } from "./comment-client.js";
import { prNumberFromEvent } from "./event.js";

export interface PostDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readText: (path: string) => Promise<string>;
  readonly fetch: (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;
  readonly log: (line: string) => void;
}

const MAX_BODY = 65000;

/** Returns the exit code, always 0. Prints only fixed text and status codes. */
export async function postComment(deps: PostDeps): Promise<number> {
  const { env, log } = deps;
  if (env["GITHUB_EVENT_NAME"] !== "pull_request" || env["SEXTON_COMMENT"] !== "true") {
    log("sexton: comment skipped, not a pull_request event or comment is off");
    return 0;
  }
  const token = env["SEXTON_TOKEN"];
  if (token === undefined || token === "") {
    log("::warning::sexton: no token, comment not posted");
    return 0;
  }
  let target;
  let body: string;
  try {
    const eventPath = env["GITHUB_EVENT_PATH"] ?? "";
    target = targetFrom(env["GITHUB_REPOSITORY"], prNumberFromEvent(await deps.readText(eventPath)));
    body = (await deps.readText(env["SEXTON_SUMMARY"] ?? "")).slice(0, MAX_BODY);
  } catch {
    log("::warning::sexton: event or summary file could not be read, comment not posted");
    return 0;
  }
  if (target === null) {
    log("::warning::sexton: no valid pull request number or repository, comment not posted");
    return 0;
  }
  const send = async (request: ApiRequest): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT_VALUE,
    };
    if (request.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await deps.fetch(request.url, { method: request.method, headers, ...(request.body !== undefined ? { body: request.body } : {}) });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, json };
  };
  const outcome = await postOrUpdate(target, body, send);
  if (outcome.ok) log(`sexton: comment ${outcome.action}`);
  else log(`::warning::sexton: comment not posted${outcome.status === null ? "" : ` (HTTP ${String(outcome.status)})`}`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await postComment({
    env: process.env,
    readText: (path) => readFile(path, "utf8"),
    fetch: (url, init) => fetch(url, init),
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
  });
}
