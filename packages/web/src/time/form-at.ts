import type { Form, PackageTimeline, ScanResponse, State } from "@sexton/api";
/** A Form as the Web app uses it: the Engine's Form plus the optional Segment version (replay only). */
export interface FormView {
  readonly state: State | null;
  readonly reason: string;
  readonly ghost: boolean;
  readonly version?: string;
}
export const NOT_PUBLISHED_REASON = "installed version not yet published";
/** The Form before the installed version exists: no state, no Ghost. */
export const NOT_PUBLISHED: FormView = { state: null, reason: NOT_PUBLISHED_REASON, ghost: false };
/** Own keys only, so a package named `__proto__` or `constructor` never reaches Object.prototype. */
export function timelineOf(response: ScanResponse, name: string): PackageTimeline | undefined {
  const all = response.timelines;
  return all !== undefined && Object.hasOwn(all, name) ? all[name] : undefined;
}
/** True when two Forms are the same grave: state, Ghost and version. The reason text is not part of the identity. */
export function sameForm(a: FormView, b: FormView): boolean {
  return a.state === b.state && a.ghost === b.ghost && a.version === b.version;
}
function viewOf(segment: { readonly state: State | null; readonly reason: string; readonly ghost: boolean; readonly version?: string }): FormView {
  return segment.version === undefined
    ? { state: segment.state, reason: segment.reason, ghost: segment.ghost }
    : { state: segment.state, reason: segment.reason, ghost: segment.ghost, version: segment.version };
}
/**
 * Pure lookup, no state rule. No timeline: the scan Form. Before the first Segment: the Not-published form
 * when coveredFrom is null, else the first Segment's Form. Otherwise the last Segment with from <= instantMs.
 */
export function formAt(timeline: PackageTimeline | undefined, instantMs: number, scanForm: Form): FormView {
  if (timeline === undefined) return { state: scanForm.state, reason: scanForm.reason, ghost: scanForm.ghost };
  const segments = timeline.segments;
  const first = segments[0];
  if (first === undefined) return { state: scanForm.state, reason: scanForm.reason, ghost: scanForm.ghost };
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    if (seg !== undefined && Date.parse(seg.from) <= instantMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found === -1) return timeline.coveredFrom === null ? NOT_PUBLISHED : viewOf(first);
  const seg = segments[found];
  return seg === undefined ? NOT_PUBLISHED : viewOf(seg);
}
