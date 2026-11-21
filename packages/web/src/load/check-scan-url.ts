export type ScanUrlCheck = { readonly ok: true; readonly url: string } | { readonly ok: false };

const REJECTED: ScanUrlCheck = { ok: false };

/** Pure. Accepts same-origin URLs, or https URLs on the API base origin. Never throws (2.3 to 2.5). */
export function checkScanUrl(input: string, pageOrigin: string, apiBaseUrl: string | null): ScanUrlCheck {
  if (input === "") return REJECTED;
  try {
    const page = new URL(pageOrigin);
    const crossOrigin = apiBaseUrl !== null && !apiBaseUrl.startsWith("/") ? new URL(apiBaseUrl).origin : null;
    const u = new URL(input, page.origin + "/");
    if (u.protocol !== "http:" && u.protocol !== "https:") return REJECTED;
    if (u.username !== "" || u.password !== "") return REJECTED;
    if (u.origin === page.origin) return { ok: true, url: u.href };
    if (u.protocol === "https:" && crossOrigin !== null && u.origin === crossOrigin) {
      return { ok: true, url: u.href };
    }
    return REJECTED;
  } catch {
    return REJECTED;
  }
}
