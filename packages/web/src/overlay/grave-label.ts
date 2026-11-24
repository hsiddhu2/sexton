import type { PackageHealth } from "@sexton/api";
import type { FormView } from "../time/form-at.js";
export const NOT_PUBLISHED_TEXT = "not yet published on this date";
export const MARKER_LABEL_SUFFIX = " pull request opened";

/** The accessible name of a grave button. With a Form, the state, Ghost and version come from the Form. A marker adds a suffix. */
export function graveLabel(pkg: PackageHealth, view?: FormView, marker = false): string {
  return marker ? `${baseLabel(pkg, view)}${MARKER_LABEL_SUFFIX}` : baseLabel(pkg, view);
}

function baseLabel(pkg: PackageHealth, view?: FormView): string {
  const version = view?.version ?? pkg.installedVersion;
  if (view !== undefined && view.state === null) return `${pkg.name} ${version}, ${NOT_PUBLISHED_TEXT}`;
  const base = `${pkg.name} ${version}, ${view?.state ?? pkg.state}`;
  if (view !== undefined) return view.ghost ? `${base}, with advisories` : base;
  const signal = pkg.signals.advisories;
  if (!signal.available || signal.value.length === 0) return base;
  const n = signal.value.length;
  return n === 1 ? `${base}, 1 advisory` : `${base}, ${String(n)} advisories`;
}
