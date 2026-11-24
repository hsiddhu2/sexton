import type { ChangeEvent, RefObject } from "react";
import { scanTimeView } from "../header/format-scan-time.js";
export const SCRUB_NOTE_TEXT = "Before the scan date Sexton uses only dated facts. Deprecation, undated advisories and snapshot history are unknown.";
export const DRAWER_SCAN_DATE_TEXT = "The drawer shows the scan date.";
export interface ScrubberProps {
  readonly stops: readonly number[];
  readonly index: number;
  readonly onChange: (index: number) => void;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
}
export function stopText(ms: number): string {
  return scanTimeView(new Date(ms).toISOString()).text;
}
const TICK_WIDTH = 1000;
/** One path for every tick, whatever the mark count. Stops are equally spaced by index. */
export function tickPath(count: number): string {
  if (count < 2) return "";
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) parts.push(`M${String(Math.round((i / (count - 1)) * TICK_WIDTH))} 0v6`);
  return parts.join("");
}
export function Scrubber({ stops, index, onChange, inputRef }: ScrubberProps) {
  const last = stops.length - 1;
  const current = stops[index] ?? stops[last] ?? 0;
  const text = stopText(current);
  const onInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = Number(event.target.value);
    if (Number.isInteger(next) && next >= 0 && next <= last) onChange(next);
  };
  return (
    <section className="scrub" aria-label="History">
      <div className="scrub-row">
        <label htmlFor="history-date">History date</label>
        <span className="scrub-date">{text}</span>
      </div>
      <div className="scrub-track">
        <input
          ref={inputRef}
          id="history-date"
          type="range"
          aria-label="History date"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-valuetext={text}
          onChange={onInput}
        />
        <svg className="scrub-ticks" viewBox={`0 0 ${String(TICK_WIDTH)} 6`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={tickPath(stops.length)} />
        </svg>
      </div>
      {index < last ? <p className="scrub-note">{SCRUB_NOTE_TEXT}</p> : null}
      {index < last ? <p className="scrub-note">{DRAWER_SCAN_DATE_TEXT}</p> : null}
    </section>
  );
}
