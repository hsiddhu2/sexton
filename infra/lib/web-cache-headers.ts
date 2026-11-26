// Cache-Control values the CloudFront response headers policies send to the browser.
// Spec fresh-site, Requirements 2.1, 2.2.

/** Unhashed web files: the browser may store them but revalidates before every use. */
export const WEB_CACHE_CONTROL = "no-cache";

/** Files under assets/ carry a content hash in their name, so they never change. */
export const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** CloudFront path pattern for the hashed build output. */
export const ASSET_PATH_PATTERN = "/assets/*";

/** The Cache-Control header a web path should carry. Not for /api/ paths. */
export function expectedCacheControl(path: string): string {
  return path.startsWith("/assets/") ? ASSET_CACHE_CONTROL : WEB_CACHE_CONTROL;
}
