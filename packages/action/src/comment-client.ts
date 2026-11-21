// The three GitHub REST requests the comment step may send, and the plan that picks them.
// Spec: .kiro/specs/cli-and-action, Requirements 9.5, 9.6. Pure.
// List: GET /repos/{owner}/{repo}/issues/{issue_number}/comments; create: POST the same path; update:
// PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}. https://docs.github.com/en/rest/issues/comments

export const API_BASE = "https://api.github.com";
export const API_VERSION = "2026-03-10";
export const MARKER = "<!-- sexton:check -->";
export const BOT_LOGIN = "github-actions[bot]";
export const USER_AGENT_VALUE = "sexton-action (+https://github.com/hsiddhu2/sexton)";
export const MAX_PAGES = 3;
export const PER_PAGE = 100;

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export interface Target {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

export interface ApiRequest {
  readonly method: "GET" | "POST" | "PATCH";
  readonly url: string;
  readonly body?: string;
}

function positive(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0;
}

/** owner/repo from GITHUB_REPOSITORY with the pull request number, or null when any part is not valid. */
export function targetFrom(repository: string | undefined, number: number | null): Target | null {
  if (typeof repository !== "string" || number === null || !positive(number)) return null;
  const parts = repository.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts as [string, string];
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo, number };
}

export function listRequest(t: Target, page: number): ApiRequest {
  return { method: "GET", url: `${API_BASE}/repos/${t.owner}/${t.repo}/issues/${String(t.number)}/comments?per_page=${String(PER_PAGE)}&page=${String(page)}` };
}

export function createRequest(t: Target, body: string): ApiRequest {
  return { method: "POST", url: `${API_BASE}/repos/${t.owner}/${t.repo}/issues/${String(t.number)}/comments`, body: JSON.stringify({ body }) };
}

export function updateRequest(t: Target, id: number, body: string): ApiRequest {
  return { method: "PATCH", url: `${API_BASE}/repos/${t.owner}/${t.repo}/issues/comments/${String(id)}`, body: JSON.stringify({ body }) };
}

/** The id of our own marker comment in one page of the list response, or null. Never one written by anyone else. */
export function ownMarkerComment(page: unknown): number | null {
  if (!Array.isArray(page)) return null;
  for (const item of page as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    const user = c["user"];
    const login = typeof user === "object" && user !== null ? (user as Record<string, unknown>)["login"] : undefined;
    const type = typeof user === "object" && user !== null ? (user as Record<string, unknown>)["type"] : undefined;
    const id = c["id"];
    const body = c["body"];
    if (login === BOT_LOGIN && type === "Bot" && typeof body === "string" && body.startsWith(MARKER) && typeof id === "number" && positive(id)) return id;
  }
  return null;
}

export interface Response {
  readonly status: number;
  readonly json: unknown;
}

export type Send = (request: ApiRequest) => Promise<Response>;

export type Outcome = { readonly ok: true; readonly action: "created" | "updated" } | { readonly ok: false; readonly status: number | null };

/** Lists at most 3 pages, then updates our marker comment or creates one. Never rejects. */
export async function postOrUpdate(target: Target, body: string, send: Send): Promise<Outcome> {
  try {
    let found: number | null = null;
    for (let page = 1; page <= MAX_PAGES && found === null; page++) {
      const response = await send(listRequest(target, page));
      if (response.status !== 200) return { ok: false, status: Number.isInteger(response.status) ? response.status : null };
      found = ownMarkerComment(response.json);
      if (!Array.isArray(response.json) || response.json.length < PER_PAGE) break;
    }
    const response = await send(found === null ? createRequest(target, body) : updateRequest(target, found, body));
    const expected = found === null ? 201 : 200;
    if (response.status !== expected) return { ok: false, status: Number.isInteger(response.status) ? response.status : null };
    return { ok: true, action: found === null ? "created" : "updated" };
  } catch {
    return { ok: false, status: null };
  }
}
