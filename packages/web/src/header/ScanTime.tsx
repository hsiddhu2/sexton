import type { JSX } from "react";
import { scanTimeView } from "./format-scan-time.js";

export function ScanTime({ iso }: { readonly iso: string }): JSX.Element {
  const view = scanTimeView(iso);
  if (view.dateTime === null) return <span>{view.text}</span>;
  return <time dateTime={view.dateTime}>{view.text}</time>;
}
