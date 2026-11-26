// The List (spec clean-site, design C4, requirement 6): the packages as a table with the columns Package, Version,
// State, Why and Fix, worst first, following the chip filter and the shown date. A row's package button opens its
// Drawer. Find, the sort buttons and aria-sort join in task 4.
import type { ScanResponse } from "@sexton/api";
import { useMemo } from "react";
import { listRows } from "./list-rows.js";
import type { State } from "@sexton/api";

export const NO_MATCH_TEXT = "No package matches.";

export interface ListViewProps {
  readonly response: ScanResponse;
  readonly filter: State | null;
  /** The shown instant in ms, or null for the scan date. */
  readonly at: number | null;
  /** Each package's index in triage order, so the Drawer returns focus to its row. */
  readonly indexOf: ReadonlyMap<string, number>;
  readonly onOpen: (name: string) => void;
}

export function ListView({ response, filter, at, indexOf, onOpen }: ListViewProps) {
  const rows = useMemo(() => listRows(response, { query: "", sort: "state", filter, at }), [response, filter, at]);
  return (
    <div className="list-view">
      <table className="list-table">
        <thead>
          <tr>
            <th scope="col">Package</th>
            <th scope="col">Version</th>
            <th scope="col">State</th>
            <th scope="col">Why</th>
            <th scope="col">Fix</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="list-none">
                {NO_MATCH_TEXT}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.name}>
                <td>
                  <button
                    type="button"
                    className="list-open"
                    data-grave-index={indexOf.get(row.name)}
                    onClick={() => {
                      onOpen(row.name);
                    }}
                  >
                    {row.name}
                  </button>
                </td>
                <td className="list-version">{row.version}</td>
                <td>
                  <span className={`badge badge-${row.state.toLowerCase()}`}>
                    <span className="badge-dot" aria-hidden="true" />
                    {row.state}
                  </span>
                </td>
                <td className="list-muted">{row.why}</td>
                <td>{row.fix}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
