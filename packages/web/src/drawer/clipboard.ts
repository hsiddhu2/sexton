// The one copy of the Drawer's fix tab (spec clean-site, design C5, requirements 7.11 and 7.12). It wraps
// navigator.clipboard.writeText and answers "ok" or "blocked"; a missing clipboard or a refusal is "blocked".
export type CopyResult = "ok" | "blocked";

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

function pageClipboard(): ClipboardLike | undefined {
  try {
    return typeof navigator === "undefined" ? undefined : (navigator.clipboard as ClipboardLike | undefined);
  } catch {
    return undefined;
  }
}

export async function copyText(text: string, clipboard: ClipboardLike | undefined = pageClipboard()): Promise<CopyResult> {
  if (clipboard === undefined || typeof clipboard.writeText !== "function") return "blocked";
  try {
    await clipboard.writeText(text);
    return "ok";
  } catch {
    return "blocked";
  }
}
