// The Fix order card (spec clean-site, design C3, requirements 3.18 to 3.22): up to five numbered rows; a row press
// makes its package the Selected grave and opens nothing.
import type { FixRow } from "./fix-order.js";
import { NOTHING_TO_FIX } from "./fix-order.js";

export const FIX_ORDER_HEADING = "Fix in this order";

export interface FixOrderProps {
  readonly rows: readonly FixRow[];
  /** The Looked-at grave's name; its row carries the current-row mark (3.20). */
  readonly current: string | null;
  readonly onPick: (name: string) => void;
}

export function FixOrder({ rows, current, onPick }: FixOrderProps) {
  return (
    <section className="card fix-order" aria-labelledby="fix-order-heading">
      <h2 id="fix-order-heading" className="eyebrow">
        {FIX_ORDER_HEADING}
      </h2>
      {rows.length === 0 ? (
        <p className="fix-none">{NOTHING_TO_FIX}</p>
      ) : (
        <ol className="fix-rows">
          {rows.map((row, i) => (
            <li key={row.name}>
              <button
                type="button"
                className={row.name === current ? "fix-row fix-row-current" : "fix-row"}
                aria-current={row.name === current ? "true" : undefined}
                onClick={() => {
                  onPick(row.name);
                }}
              >
                <span className="fix-name">
                  <span className="fix-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  {row.name}
                </span>
                <span className="fix-line">{row.line}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
