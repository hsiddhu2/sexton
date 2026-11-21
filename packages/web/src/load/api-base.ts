const PATH_BASE = /^\/[A-Za-z0-9._~/-]*$/;

/** A same-origin path base such as /api. Whitelist only; one trailing slash is stripped. */
function parsePathBase(raw: string): string | null {
  if (!PATH_BASE.test(raw)) return null;
  if (raw === "/" || raw.includes("//") || raw.includes("..") || /(^|\/)\.(\/|$)/.test(raw)) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/** Returns the normalised base (no trailing slash), or null when absent, empty or invalid (2.17). */
export function parseApiBase(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return null;
  if (raw.startsWith("/")) return parsePathBase(raw);
  if (raw.includes("?") || raw.includes("#")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  const href = url.href;
  return href.endsWith("/") ? href.slice(0, -1) : href;
}
