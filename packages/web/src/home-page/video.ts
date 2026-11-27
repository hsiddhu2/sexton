// The demo video slot (spec home-page, requirement 8): the section renders only while this holds an https URL. No
// placeholder ships while it is null.
export const DEMO_VIDEO_URL: string | null = null;

/** Pure. The URL when it is an https URL, else null (8.1). */
export function videoUrl(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}
