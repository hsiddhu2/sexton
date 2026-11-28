// The Narrow layout (under 700 px, spec clean-site, C13) read in code, for the few texts that change with it (spec
// home-page, 3.8 and 12.12). Every call to matchMedia is guarded, so a browser or test without it reads as wide.
import { useEffect, useState } from "react";

export const NARROW_QUERY = "(max-width: 699px)";

function narrowNow(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
  } catch {
    return false;
  }
}

/** True while the viewport is in the Narrow layout. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(narrowNow);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(NARROW_QUERY);
    } catch {
      return undefined;
    }
    const update = (): void => {
      setNarrow(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);
  return narrow;
}
