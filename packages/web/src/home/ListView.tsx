// The List (spec clean-site, design C4, requirement 6): the packages as a table with the columns Package, Version,
// State, Why and Fix, worst first, following the chip filter and the shown date. "Find a package" keeps only the names
// that hold its trimmed text; the Package and State heading buttons sort, and the sorted column carries aria-sort.
// A press on a row, or Enter on its package button, opens its Drawer. The Find text lives here, not in the address.
import type { ScanResponse, State } from "@sexton/api";
import { useMemo, useState } from "react";
import { listRows, type ListSort } from "./list-rows.js";

export const NO_MATCH_TEXT = "No package matches.";
export const FIND_LABEL = "Find a package";

export interface ListViewProps {
  readonly response: ScanResponse;
  readonly filter: State | null;
  /** The shown instant in ms, or null for the scan date. */
  readonly at: number | null;
  /** Each package's index in triage order, so the Drawer returns focus to its row. */
  readonly indexOf: ReadonlyMap<string, number>;
  readonly onOpen: (name: string) => void;
}

interface SortHeadingProps {
  readonly sort: ListSort;
  readonly current: ListSort;
  readonly label: string;
  /** The mark after the label while this column is sorted; hidden from assistive technology, which reads aria-sort. */
  readonly mark: string;
  readonly onSort: (sort: ListSort) => void;
}

function SortHeading({ sort, current, label, mark, onSort }: SortHeadingProps) {
  const on = sort === current;
  return (
    <th scope="col" {...(on ? { "aria-sort": "ascending" as const } : {})}>
      <button
        type="button"
        className="list-sort"
        onClick={() => {
          onSort(sort);
        }}
      >
        {label}
        {on ? <span aria-hidden="true">{` ${mark}`}</span> : null}
      </button>
    </th>
  );
}

export function ListView({ response, filter, at, indexOf, onOpen }: ListViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("state");
  const rows = useMemo(() => listRows(response, { query, sort, filter, at }), [response, query, sort, filter, at]);
  return (
    <div className="list-view">
      <input
        type="search"
        className="list-find"
        placeholder={FIND_LABEL}
        aria-label={FIND_LABEL}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <table className="list-table">
        <thead>
          <tr>
            <SortHeading sort="name" current={sort} label="Package" mark="↑" onSort={setSort} />
            <th scope="col">Version</th>
            <SortHeading sort="state" current={sort} label="State" mark="↑ worst first" onSort={setSort} />
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
              <tr
                key={row.name}
                className="list-row"
                onClick={() => {
                  onOpen(row.name);
                }}
              >
                <td>
                  <button type="button" className="list-open" data-grave-index={indexOf.get(row.name)}>
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
