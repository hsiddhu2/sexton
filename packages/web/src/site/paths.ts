// The path a Cemetery view address is written on (spec home-page, design C1, requirement 1.7). Pure.
import type { View } from "../load/view-address.js";
import { CEMETERY_PATH, SCAN_PATH } from "./route.js";

/** "/scan" for a Live scan, "/cemetery" for every other View. */
export function cemeteryPath(view: View): typeof CEMETERY_PATH | typeof SCAN_PATH {
  return view.source.kind === "repo" ? SCAN_PATH : CEMETERY_PATH;
}
