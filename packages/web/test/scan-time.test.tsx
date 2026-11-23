import { render } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { scanTimeView } from "../src/header/format-scan-time.js";
import { ScanTime } from "../src/header/ScanTime.js";

const NUM_RUNS = 100;
const MIN_MS = 0;
const MAX_MS = Date.parse("9999-12-31T23:59:59.999Z");
const TEXT = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}), (\d{2}):(\d{2}) UTC$/;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function readBack(text: string): number {
  const m = TEXT.exec(text);
  if (m === null) throw new Error("text does not match");
  const [, d, mon, y, h, min] = m;
  const date = new Date(0);
  date.setUTCFullYear(Number(y), MONTH_NAMES.indexOf(mon ?? ""), Number(d));
  date.setUTCHours(Number(h), Number(min), 0, 0);
  return date.getTime();
}

describe("Feature: cemetery-polish, Property 5: The scan time formatter round-trips", () => {
  it("round-trips Z-form instants", () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN_MS, max: MAX_MS }), (ms) => {
        const iso = new Date(ms).toISOString();
        const view = scanTimeView(iso);
        expect(view.dateTime).not.toBeNull();
        expect(Date.parse(view.dateTime ?? "")).toBe(ms);
        expect(TEXT.test(view.text)).toBe(true);
        expect(readBack(view.text)).toBe(ms - (ms % 60000));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("round-trips offset-form instants", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 86_400_000, max: MAX_MS - 86_400_000 }),
        fc.integer({ min: -14, max: 14 }),
        fc.constantFrom(0, 30),
        (ms, hours, minutes) => {
          const sign = hours < 0 ? "-" : "+";
          const offset = `${sign}${String(Math.abs(hours)).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
          const offsetMs = (hours < 0 ? -1 : 1) * (Math.abs(hours) * 60 + minutes) * 60000;
          const local = new Date(ms + offsetMs).toISOString().slice(0, 19);
          const iso = `${local}${offset}`;
          const view = scanTimeView(iso);
          expect(view.dateTime).toBe(iso);
          expect(Date.parse(iso)).toBe(ms - (ms % 1000));
          const instant = Date.parse(iso);
          expect(readBack(view.text)).toBe(instant - (instant % 60000));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns the input and null for strings that are not ISO", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^\d{4}-\d{2}-\d{2}T/.test(s)),
        (s) => {
          expect(scanTimeView(s)).toEqual({ text: s, dateTime: null });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns the input and null for ISO-shaped strings that do not parse", () => {
    expect(scanTimeView("2026-13-45T99:99:99Z")).toEqual({ text: "2026-13-45T99:99:99Z", dateTime: null });
  });
});

describe("ScanTime examples", () => {
  it("rejects an impossible calendar day", () => {
    expect(scanTimeView("2026-02-31T00:00:00Z")).toEqual({ text: "2026-02-31T00:00:00Z", dateTime: null });
    expect(scanTimeView("2024-02-29T00:00:00Z").dateTime).not.toBeNull();
  });

  it("formats a known instant", () => {
    expect(scanTimeView("2026-11-12T00:00:00.000Z").text).toBe("12 Nov 2026, 00:00 UTC");
    const { container } = render(<ScanTime iso="2026-11-12T00:00:00.000Z" />);
    const el = container.querySelector("time");
    expect(el?.getAttribute("datetime")).toBe("2026-11-12T00:00:00.000Z");
    expect(el?.textContent).toBe("12 Nov 2026, 00:00 UTC");
  });

  it("renders unparseable text in a span", () => {
    const { container } = render(<ScanTime iso="not recorded" />);
    expect(container.querySelector("time")).toBeNull();
    expect(container.querySelector("span")?.textContent).toBe("not recorded");
  });
});
