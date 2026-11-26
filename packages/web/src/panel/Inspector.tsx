// The Inspector (spec clean-site, design C3, requirements 3.3 to 3.12 and 3.25): "You are looking at", the Looked-at
// grave's name, its Epitaph line at the scan date (design C16, 19.1), version and State badge, one plain sentence, three
// signals and one gold button.
import type { PackageHealth, State } from "@sexton/api";
import { TermText } from "../glossary/TermText.js";
import type { Term } from "../glossary/glossary.js";
import { EPITAPH_LINES } from "../copy/mischief.js";
import { reasonFamily, reasonSentence } from "./reason-family.js";
import { pickSignals } from "./pick-signals.js";

export const INSPECTOR_HEADING = "You are looking at";
export const SELECTED_MARK = "Selected";
export const EVIDENCE_AND_FIX = "See the evidence and the fix";
export const EVIDENCE_ONLY = "See the evidence";
export const NOT_PUBLISHED_TEXT = "The installed version did not exist yet.";
export const NOT_PUBLISHED_BADGE = "Not published";

export interface InspectorProps {
  readonly pkg: PackageHealth;
  /** The State at the shown date: the scan State at the scan date, null for a package not published then. */
  readonly state: State | null;
  /** The version at the shown date. */
  readonly version: string;
  /** The shown date as written for display, or null at the scan date (3.12). */
  readonly date: string | null;
  /** True while no grave is under the pointer and no grave button has focus (3.4). */
  readonly selected: boolean;
  /** True when the package has a Proposed plan (3.6, 3.7). */
  readonly proposed: boolean;
  /** Opens the Drawer (3.8); absent on a Replay, whose grave opens nothing from the Panel. */
  readonly onOpen?: (name: string) => void;
  readonly onTerm?: (term: Term, anchor: HTMLButtonElement) => void;
}

/** Pure. The Epitaph line (19.1, 19.2): only at the scan date, and only for a reason with a Reason family. */
export function epitaphLine(pkg: PackageHealth, date: string | null): string | null {
  if (date !== null) return null;
  const family = reasonFamily(pkg.stateReason);
  return family === null ? null : EPITAPH_LINES[family];
}

/** Pure. The Inspector sentence: the plain sentence at the scan date, else the State on the shown date (3.12). */
export function inspectorSentence(pkg: PackageHealth, state: State | null, date: string | null): string {
  if (date === null) return reasonSentence(pkg.stateReason);
  return state === null ? NOT_PUBLISHED_TEXT : `On ${date} this package was ${state}.`;
}

export function Inspector({ pkg, state, version, date, selected, proposed, onOpen, onTerm }: InspectorProps) {
  const signals = pickSignals(pkg);
  const tone = state === null ? "pending" : state.toLowerCase();
  const epitaph = epitaphLine(pkg, date);
  return (
    <section className="card inspector" aria-labelledby="inspector-heading" data-tour="inspector">
      <h2 id="inspector-heading" className="eyebrow">
        <span>{INSPECTOR_HEADING}</span>
        {selected ? <span className="eyebrow-mark">{SELECTED_MARK}</span> : null}
      </h2>
      <p className="inspector-name">{pkg.name}</p>
      {epitaph === null ? null : <p className="inspector-epitaph">{epitaph}</p>}
      <p className="inspector-version">{version}</p>
      <p className="inspector-badge">
        <span className={`badge badge-${tone}`}>
          <span className="badge-dot" aria-hidden="true" />
          {state ?? NOT_PUBLISHED_BADGE}
        </span>
      </p>
      <p className="inspector-why">
        <TermText text={inspectorSentence(pkg, state, date)} {...(onTerm !== undefined ? { onTerm } : {})} />
      </p>
      <ul className="signals">
        {signals.map((signal) => (
          <li key={signal.key}>
            <span className="signal-label">
              <TermText text={signal.label} {...(onTerm !== undefined ? { onTerm } : {})} />
            </span>
            <b className={`signal-value-${signal.tone}`}>{signal.value}</b>
          </li>
        ))}
      </ul>
      {onOpen === undefined ? null : (
        <button
          type="button"
          className="button button-primary button-wide"
          onClick={() => {
            onOpen(pkg.name);
          }}
        >
          {proposed ? EVIDENCE_AND_FIX : EVIDENCE_ONLY}
        </button>
      )}
    </section>
  );
}
