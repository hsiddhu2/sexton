// The View address (spec calm-first-visit, requirement 8, extended by spec clean-site, design C8): the query part of
// the page address names what the page shows, so Back, Forward, a reload and a shared link all land on the same View.
// Pure.
import { isReplayId, type ReplayId } from "../replay/replay-ids.js";

export type ViewSource =
  | { readonly kind: "demo" }
  | { readonly kind: "replay"; readonly id: ReplayId }
  /** A hosted scan of a repository URL of 1 to 200 characters after trimming. */
  | { readonly kind: "repo"; readonly url: string }
  /** A scan file address, as today's ?scan; checkScanUrl decides at load. */
  | { readonly kind: "scan"; readonly address: string }
  /** A replay value outside the closed set: today's error card. */
  | { readonly kind: "rejected" };

/** A Source a Home or Guide page View can hold. */
export type HomeSource = Extract<ViewSource, { readonly kind: "demo" | "repo" | "scan" }>;

export interface View {
  readonly source: ViewSource;
  /** The Guide page (page=guide) or Home. */
  readonly page: "home" | "guide";
  /** The List in place of the Scene (view=list). */
  readonly list: boolean;
  /** The package whose drawer is open, or null. */
  readonly grave: string | null;
  /** The chosen Stop as an ISO instant, or null for the default one. */
  readonly at: string | null;
}

export const HOME_VIEW: View = { source: { kind: "demo" }, page: "home", list: false, grave: null, at: null };
export const MAX_REPO_LENGTH = 200;
/** The longest npm package name. */
export const MAX_GRAVE_LENGTH = 214;

/** Pure. The trimmed repository URL, or null when it is empty or longer than MAX_REPO_LENGTH. */
export function repoValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" || trimmed.length > MAX_REPO_LENGTH ? null : trimmed;
}

function single(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? (values[0] ?? null) : null;
}

/** True for an ISO instant in the exact form Date#toISOString writes. */
export function isIsoInstant(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function sourceOf(params: URLSearchParams, hosted: boolean): ViewSource {
  const replays = params.getAll("replay");
  if (replays.length > 0) {
    const only = replays[0];
    return replays.length === 1 && only !== undefined && isReplayId(only) ? { kind: "replay", id: only } : { kind: "rejected" };
  }
  if (params.has("repo")) {
    const raw = single(params, "repo");
    const url = raw === null ? null : repoValue(raw);
    return hosted && url !== null ? { kind: "repo", url } : { kind: "demo" };
  }
  if (params.has("scan")) return { kind: "scan", address: params.get("scan") ?? "" };
  return { kind: "demo" };
}

/** True for a Source a Home or Guide page View can hold: demo, repo or scan. */
export function isHomeSource(source: ViewSource): source is HomeSource {
  return source.kind === "demo" || source.kind === "repo" || source.kind === "scan";
}

/**
 * Pure. The canonical form of a View (design C8): a replay or rejected View holds only its Source; a Guide page View
 * holds only its Source and `page`; any other View holds a Source, `list`, `grave` and `at`.
 */
export function canonicalView(view: View): View {
  const { source } = view;
  if (!isHomeSource(source)) return { source, page: "home", list: false, grave: null, at: null };
  if (view.page === "guide") return { source, page: "guide", list: false, grave: null, at: null };
  return { source, page: "home", list: view.list, grave: view.grave, at: view.at };
}

/**
 * Pure, never throws. `replay` wins over `repo`, `repo` over `scan`, `scan` over the Demo. A `repo` that is empty,
 * too long or repeated after trimming, or given with no API base, gives the Demo. A `grave`, `at`, `page` or `view`
 * that is not a single well-formed value is dropped, and so is any part the View does not take (10.9).
 */
export function parseView(search: string, hosted: boolean): View {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return HOME_VIEW;
  }
  const source = sourceOf(params, hosted);
  const grave = single(params, "grave");
  const at = single(params, "at");
  return canonicalView({
    source,
    page: single(params, "page") === "guide" ? "guide" : "home",
    list: single(params, "view") === "list",
    grave: grave !== null && grave !== "" && grave.length <= MAX_GRAVE_LENGTH ? grave : null,
    at: at !== null && isIsoInstant(at) ? at : null,
  });
}

/** Pure. "" for the Home view, else "?key=value&…" of the canonical View in the order replay, repo, scan, page, view, grave, at. */
export function formatView(view: View): string {
  const params = new URLSearchParams();
  const v = canonicalView(view);
  const s = v.source;
  if (s.kind === "replay") params.set("replay", s.id);
  else if (s.kind === "rejected") params.set("replay", "");
  else if (s.kind === "repo") params.set("repo", s.url);
  else if (s.kind === "scan") params.set("scan", s.address);
  if (v.page === "guide") params.set("page", "guide");
  if (v.list) params.set("view", "list");
  if (v.grave !== null) params.set("grave", v.grave);
  if (v.at !== null) params.set("at", v.at);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** Pure. True when two Sources load the same thing. */
export function sameSource(a: ViewSource, b: ViewSource): boolean {
  switch (a.kind) {
    case "replay":
      return b.kind === "replay" && b.id === a.id;
    case "repo":
      return b.kind === "repo" && b.url === a.url;
    case "scan":
      return b.kind === "scan" && b.address === a.address;
    default:
      return a.kind === b.kind;
  }
}

/** Pure. True for the address "/": Home of the Sample scan in the Graveyard view, with no drawer and no chosen date. */
export function isHome(view: View): boolean {
  return view.source.kind === "demo" && view.page === "home" && !view.list && view.grave === null && view.at === null;
}
