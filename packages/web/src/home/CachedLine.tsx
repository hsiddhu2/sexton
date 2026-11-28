// The cached line (spec home-page, design C5, requirement 13.3): "Scanned N min ago" and Rescan, under the headline
// while a saved Live scan is shown. It re-reads the clock every 30 seconds.
import { useEffect, useState } from "react";
import { scannedText } from "../cache/scan-cache.js";

export const RESCAN_TEXT = "Rescan";
export const CACHED_TICK_MS = 30_000;

export interface CachedLineProps {
  readonly savedAt: number;
  readonly now: () => number;
  readonly onRescan: () => void;
}

export function CachedLine({ savedAt, now, onRescan }: CachedLineProps) {
  const [at, setAt] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => {
      setAt(now());
    }, CACHED_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [now]);
  return (
    <p className="notice cached-line">
      <span className="cached-age">{scannedText(at - savedAt)}</span>
      <button type="button" className="cached-rescan" onClick={onRescan}>
        {RESCAN_TEXT}
      </button>
    </p>
  );
}
