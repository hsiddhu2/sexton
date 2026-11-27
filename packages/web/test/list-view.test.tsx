// Spec clean-site, task 4.1: the List view (requirements 6.1 to 6.10, 6.13 to 6.15). Find, the sort buttons with
// aria-sort, the chip filter, the empty row, and a row open by press and by Enter on its package button.
import type { ScanResponse } from "@sexton/api";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FIND_LABEL, ListView, NO_MATCH_TEXT } from "../src/home/ListView.js";
import { triageOrder } from "../src/triage/triage.js";
import { cheapScan } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

afterEach(cleanup);

const DEMO = readDemoScan() as ScanResponse;

function mount(response: ScanResponse = DEMO, filter: ScanResponse["report"]["packages"][number]["state"] | null = null) {
  const opened: string[] = [];
  const order = triageOrder(response.report.packages);
  const indexOf = new Map(order.map((p, i) => [p.name, i]));
  const view = render(
    <ListView
      response={response}
      filter={filter}
      at={null}
      indexOf={indexOf}
      onOpen={(name) => {
        opened.push(name);
      }}
    />,
  );
  return { ...view, opened, order };
}

const names = (container: HTMLElement): string[] => [...container.querySelectorAll("tbody .list-open")].map((b) => b.textContent ?? "");
const heading = (container: HTMLElement, i: number): HTMLElement => container.querySelectorAll("thead th")[i] as HTMLElement;

describe("the List view", () => {
  it("opens worst first in triage order, with aria-sort on the State column only (6.1, 6.6)", () => {
    const { container, order } = mount();
    expect(names(container)).toEqual(order.map((p) => p.name));
    expect(heading(container, 2).getAttribute("aria-sort")).toBe("ascending");
    expect(heading(container, 0).hasAttribute("aria-sort")).toBe(false);
    expect([...container.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Package", "Version", "State ↑ worst first", "Why", "Fix"]);
    expect(within(heading(container, 2)).getByRole("button", { name: "State" })).toBeTruthy();
  });

  it("sorts by name on the Package button and back worst first on the State button (6.4, 6.5)", () => {
    const { container, order } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Package" }));
    expect(names(container)).toEqual(order.map((p) => p.name).sort());
    expect(heading(container, 0).getAttribute("aria-sort")).toBe("ascending");
    expect(heading(container, 2).hasAttribute("aria-sort")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "State" }));
    expect(names(container)).toEqual(order.map((p) => p.name));
    expect(heading(container, 2).getAttribute("aria-sort")).toBe("ascending");
  });

  it("keeps the names holding the trimmed Find text, ignoring case, and shows one row when none matches (6.3, 6.8)", async () => {
    const { container } = mount();
    const find = screen.getByRole("searchbox", { name: FIND_LABEL });
    expect(find.getAttribute("placeholder")).toBe(FIND_LABEL);
    await userEvent.type(find, "  LEFT ");
    expect(names(container)).toEqual(["left-padder", "left-pad"]);
    fireEvent.change(find, { target: { value: "no-such-package" } });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toBe(NO_MATCH_TEXT);
    expect(rows[0]?.querySelector("td")?.getAttribute("colspan")).toBe("5");
  });

  it("shows only the packages of the chip filter's State (6.7)", () => {
    const { container } = mount(DEMO, "Dead");
    const states = [...container.querySelectorAll("tbody .badge")].map((b) => b.textContent);
    expect(states).toHaveLength(5);
    expect(new Set(states)).toEqual(new Set(["Dead"]));
  });

  it("holds the plain sentence in Why and the Fix order line or Nothing to do in Fix (6.14)", () => {
    const { container } = mount();
    const row = (name: string): HTMLElement => [...container.querySelectorAll<HTMLElement>("tbody tr")].find((r) => r.querySelector(".list-open")?.textContent === name) as HTMLElement;
    const cells = (name: string): string[] => [...row(name).querySelectorAll("td")].map((td) => td.textContent ?? "");
    expect(cells("left-padder")[3]).toBe("A maintainer of this package changed in the last 90 days.");
    for (const pkg of DEMO.report.packages) {
      const fix = cells(pkg.name)[4] ?? "";
      expect(fix.charAt(0), pkg.name).toBe(fix.charAt(0).toUpperCase());
    }
  });

  it("opens a row's Drawer on a press anywhere in the row and on Enter on its package button (6.9, 6.10)", async () => {
    const { container, opened, order } = mount();
    const first = order[0]?.name ?? "";
    const second = order[1]?.name ?? "";
    fireEvent.click(container.querySelector("tbody tr .list-muted") as HTMLElement);
    expect(opened).toEqual([first]);
    const button = within(container.querySelector("tbody") as HTMLElement).getByRole("button", { name: second });
    expect(button.getAttribute("data-grave-index")).toBe("1");
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(opened).toEqual([first, second]);
  });

  it("shows every one of 300 packages exactly once (6.11)", () => {
    const { container } = mount(cheapScan(300));
    const shown = names(container);
    expect(shown).toHaveLength(300);
    expect(new Set(shown).size).toBe(300);
  });
});
