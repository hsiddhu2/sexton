// POST /api/remediate from the drawer. Spec: .kiro/specs/remediate, Requirement 9.3.
// The body is { repo, package }; its SHA-256 goes in x-amz-content-sha256, which CloudFront OAC needs for a POST.
// The answer is checked here again: a body that is not the response shape counts as failed, and a pull request
// URL is shown only with the demo repository prefix.

export const PR_PREFIX = "https://github.com/hsiddhu2/sexton-demo/pull/";

export type RemediateView =
  | { readonly status: "opened" | "existing"; readonly prUrl: string | null; readonly text: string }
  | { readonly status: "refused" | "failed"; readonly prUrl: null; readonly text: string };

export const OUTCOME_TEXT = {
  opened: "Pull request opened.",
  existing: "A pull request for this package is already open.",
  refused: "No pull request was opened.",
  failed: "The pull request could not be opened.",
} as const;

export function hasPrPrefix(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(PR_PREFIX) && /^[1-9][0-9]{0,9}$/.test(url.slice(PR_PREFIX.length));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const FAILED: RemediateView = { status: "failed", prUrl: null, text: OUTCOME_TEXT.failed };

/** Never rejects. The reason text from the API is fixed text, shown after the outcome line. */
export async function requestRemediation(fetchFn: typeof fetch, apiBase: string, repo: string, packageName: string): Promise<RemediateView> {
  try {
    const body = JSON.stringify({ repo, package: packageName });
    const response = await fetchFn(`${apiBase}/remediate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-amz-content-sha256": await sha256Hex(body) },
      body,
      credentials: "omit",
      redirect: "error",
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return FAILED;
    }
    if (typeof parsed !== "object" || parsed === null) return FAILED;
    const r = parsed as Record<string, unknown>;
    const reason = typeof r["reason"] === "string" ? ` ${r["reason"].slice(0, 200)}` : "";
    if (response.status === 422 && r["code"] === "repository-not-allowed") return { status: "refused", prUrl: null, text: OUTCOME_TEXT.refused };
    if (response.status !== 200) return FAILED;
    switch (r["status"]) {
      case "opened":
      case "existing":
        return { status: r["status"], prUrl: hasPrPrefix(r["prUrl"]) ? r["prUrl"] : null, text: OUTCOME_TEXT[r["status"]] };
      case "refused":
        return { status: "refused", prUrl: null, text: `${OUTCOME_TEXT.refused}${reason}` };
      case "failed":
        return { status: "failed", prUrl: null, text: `${OUTCOME_TEXT.failed}${reason}` };
      default:
        return FAILED;
    }
  } catch {
    return FAILED;
  }
}
