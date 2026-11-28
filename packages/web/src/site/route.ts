// The Route (spec home-page, design C1, requirement 1): what the path of the page address names. `/` is the Home page;
// `/cemetery` and `/scan` are the Cemetery view; an Old address on `/` forwards to the Cemetery view with its query
// unchanged; any other path forwards to `/`. Pure, never throws.

export type Route =
  | { readonly kind: "home" }
  | { readonly kind: "cemetery"; readonly search: string }
  | { readonly kind: "forward"; readonly to: string };

/** The query keys of the Cemetery view's address (spec clean-site, 10.6). */
export const CEMETERY_KEYS: readonly string[] = ["replay", "repo", "scan", "page", "view", "grave", "at"];

export const HOME_PATH = "/";
export const CEMETERY_PATH = "/cemetery";
export const SCAN_PATH = "/scan";

function paramsOf(search: string): URLSearchParams | null {
  try {
    return new URLSearchParams(search);
  } catch {
    return null;
  }
}

/** Pure. The path without one trailing slash, "/" kept. */
function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function routeOf(pathname: string, search: string): Route {
  const path = trimSlash(pathname);
  if (path === CEMETERY_PATH || path === SCAN_PATH) return { kind: "cemetery", search };
  if (path !== HOME_PATH && path !== "/index.html") return { kind: "forward", to: HOME_PATH };
  const params = paramsOf(search);
  if (params === null || !CEMETERY_KEYS.some((key) => params.has(key))) {
    return path === HOME_PATH ? { kind: "home" } : { kind: "forward", to: HOME_PATH };
  }
  const to = params.has("repo") && !params.has("replay") ? SCAN_PATH : CEMETERY_PATH;
  return { kind: "forward", to: `${to}${search}` };
}
