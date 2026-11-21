// Transport wrapper: one log line per upstream request. Spec: .kiro/specs/infra, Requirements 6.1 to 6.3.
// Logs host and path only. Never reads the query, the fragment, a header or the body.
// For GitHub hosts no Owner or Repo reaches a log line: raw keeps only the file path, other GitHub hosts no path (design.md, item 14).

import type { Transport } from "@sexton/engine";
import { errorName, type LogFields, type Logger } from "./logger.js";

export const MAX_LOGGED_PATH = 200;

/** GitHub hosts. Their request paths hold an Owner and Repo, which are never logged (design.md, item 14). */
export const RAW_GITHUB_HOST = "raw.githubusercontent.com";
export const GITHUB_HOSTS: ReadonlySet<string> = new Set([RAW_GITHUB_HOST, "github.com", "api.github.com"]);

/**
 * raw.githubusercontent.com/{owner}/{repo}/{ref}/{file...}: only the file path after the first three segments.
 * github.com and api.github.com: no path at all. Every other host: the path, cut to 200 characters.
 */
function loggedPath(hostname: string, pathname: string): string {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (!GITHUB_HOSTS.has(host)) return pathname.slice(0, MAX_LOGGED_PATH);
  if (host !== RAW_GITHUB_HOST) return "";
  const segments = pathname.split("/").filter((segment) => segment !== "");
  return segments.length > 3 ? segments.slice(3).join("/").slice(0, MAX_LOGGED_PATH) : "";
}

export function upstreamFields(url: string, status: number, latencyMs: number): LogFields {
  let host = "invalid-url";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.host;
    path = loggedPath(parsed.hostname, parsed.pathname);
  } catch {
    // An unparseable URL logs no part of itself.
  }
  return { msg: "upstream", host, path, status, latencyMs };
}

/** Runs a log call and swallows any error from it: logging must never change a request's outcome. */
function quietly(write: () => void): void {
  try {
    write();
  } catch {
    // A failing sink loses one line, never the response or the original error.
  }
}

export function withRequestLogging(inner: Transport, log: Logger, clock: () => number = () => Date.now()): Transport {
  return async (url, request) => {
    const started = clock();
    let response: Awaited<ReturnType<Transport>>;
    try {
      response = await inner(url, request);
    } catch (error) {
      quietly(() => log.warn({ ...upstreamFields(url, 0, Math.max(0, clock() - started)), error: errorName(error) }));
      throw error;
    }
    quietly(() => log.info(upstreamFields(url, response.status, Math.max(0, clock() - started))));
    return response;
  };
}
