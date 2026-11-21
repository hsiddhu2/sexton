/** Returns the normalised base (no trailing slash), or null when absent, empty or invalid (2.17). */
export function parseApiBase(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return null;
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
