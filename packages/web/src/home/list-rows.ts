// The rows of the List (spec clean-site, design C4, requirements 6.2 to 6.7, 6.11 and 6.14). Each package's State,
// version and reason come from its Segment at the shown date; a package not published then is left out. Sort "state"
// is triage order at the scan date. Pure.
import type { PackageHealth, ScanResponse, State } from "@sexton/api";
import { fixLine, plansByName } from "../panel/fix-order.js";
import { reasonSentence } from "../panel/reason-family.js";
import { hasGhost } from "../scene/layout.js";
import { formAt, timelineOf, type FormView } from "../time/form-at.js";
import { triageOrder } from "../triage/triage.js";

export type ListSort = "state" | "name";

export interface ListOptions {
  readonly query: string;
  readonly sort: ListSort;
  readonly filter: State | null;
  /** The shown instant in ms, or null for the scan date. */
  readonly at: number | null;
}

export interface ListRow {
  readonly name: string;
  readonly version: string;
  readonly state: State;
  /** The plain sentence of 3.9 and 3.10. */
  readonly why: string;
  /** The Fix order line of 3.19 with a capital first letter, or "Nothing to do". */
  readonly fix: string;
}

export const NOTHING_TO_DO = "Nothing to do";
const CALM: ReadonlySet<State> = new Set<State>(["Restless", "Alive"]);

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const byName = (a: PackageHealth, b: PackageHealth): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Pure. The rows that are published at the date, contain the trimmed query in their name ignoring case, and match the filter. */
export function listRows(response: ScanResponse, options: ListOptions): ListRow[] {
  const query = options.query.trim().toLowerCase();
  const plans = plansByName(response.remediations);
  const ordered = options.sort === "name" ? response.report.packages.slice().sort(byName) : triageOrder(response.report.packages);
  const rows: ListRow[] = [];
  for (const pkg of ordered) {
    if (query !== "" && !pkg.name.toLowerCase().includes(query)) continue;
    const scanForm: FormView = { state: pkg.state, reason: pkg.stateReason, ghost: hasGhost(pkg) };
    const form: FormView = options.at === null ? scanForm : formAt(timelineOf(response, pkg.name), options.at, scanForm);
    const state = form.state;
    if (state === null) continue;
    if (options.filter !== null && state !== options.filter) continue;
    const plan = plans.get(pkg.name);
    const version = form.version ?? pkg.installedVersion;
    const fix = CALM.has(pkg.state) && plan?.status !== "proposed" ? NOTHING_TO_DO : capital(fixLine(pkg, plan));
    rows.push({ name: pkg.name, version, state, why: reasonSentence(form.reason), fix });
  }
  return rows;
}
