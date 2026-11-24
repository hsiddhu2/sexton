// The pull request marker. Spec cemetery-time, requirements 14 and 16. No network.
import type { PackageHealth, ScanResponse } from "@sexton/api";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { OPEN_PR_TEXT } from "../src/drawer/Drawer.js";
import { PR_PREFIX, type RemediateView } from "../src/load/remediate-client.js";
import { MARKER_LABEL_SUFFIX, graveLabel } from "../src/overlay/grave-label.js";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { planScene } from "../src/scene/layout.js";
import { PALETTE } from "../src/scene/palette.js";
import { BURIAL_MS } from "../src/time/burial.js";
import { arbScenePackages, arbTheme } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DEMO = readDemoScan() as ScanResponse;
const proposed = DEMO.remediations?.find((r) => r.status === "proposed" && r.intent !== undefined);
if (proposed === undefined) throw new Error("the demo scan has no proposed plan with an intent");
const PKG = proposed.packageName;
const HOSTED: ScanResponse = { ...DEMO, actions: { remediate: true } };

function record(plan: ReturnType<typeof planScene>): string[] {
  const out: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return (...args: unknown[]) => {
        out.push(`${prop}(${args.filter((a) => typeof a === "number").join(",")})`);
        return { addColorStop: () => undefined };
      };
    },
    set(obj, prop: string, value: unknown) {
      obj[prop] = value;
      if (prop === "fillStyle") out.push(`fillStyle=${String(value)}`);
      return true;
    },
  }) as unknown as PaintContext2D;
  drawScene(ctx, plan, 1);
  return out;
}

const MARKER_RECTS = [
  [160, 124, 2, 44],
  [162, 124, 14, 4],
  [162, 128, 10, 4],
  [162, 132, 6, 4],
] as const;

describe("Feature: cemetery-time, Property 18: The marker adds nothing but the marker", () => {
  it("sets marker exactly from the marks, changes nothing else and draws four fixed rectangles per mark", () => {
    fc.assert(
      fc.property(arbScenePackages([1, 5, 61]), arbTheme, fc.array(fc.boolean(), { minLength: 61, maxLength: 61 }), (packages, theme, flags) => {
        const marks = packages.map((_, i) => flags[i] === true);
        const base = { packages, width: 1200, theme, selectedIndex: null, ghostPhase: 0 };
        const plain = planScene(base);
        const marked = planScene({ ...base, marks });
        marked.graves.forEach((g, i) => {
          expect(g.marker).toBe(marks[i]);
          expect({ ...g, marker: false }).toEqual({ ...(plain.graves[i] as typeof g), marker: false });
          expect(graveLabel(packages[i] as PackageHealth, undefined, g.marker).endsWith(MARKER_LABEL_SUFFIX)).toBe(marks[i]);
        });
        expect(marked.scenery).toBe(plain.scenery);
        expect(marked.graves.map((g) => g.name)).toEqual(plain.graves.map((g) => g.name));

        const colour = PALETTE[theme].marker;
        const withMarks = record(marked);
        const without = record(plain);
        const stripped: string[] = [];
        const drawn: string[] = [];
        for (let i = 0; i < withMarks.length; i += 1) {
          if (withMarks[i] === `fillStyle=${colour}`) {
            drawn.push(...withMarks.slice(i + 1, i + 5));
            i += 4;
          } else stripped.push(withMarks[i] as string);
        }
        expect(stripped).toEqual(without);
        const expected = marked.graves.flatMap((g) => (g.marker ? MARKER_RECTS.map((r) => `fillRect(${String(g.rect.x + r[0])},${String(g.rect.y + r[1])},${String(r[2])},${String(r[3])})`) : []));
        expect(drawn).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("a plan in remediations marks nothing", () => {
    const { container } = render(<Cemetery response={HOSTED} theme="dark" reducedMotion={true} />);
    expect(HOSTED.remediations?.length).toBeGreaterThan(0);
    for (const b of container.querySelectorAll("button[data-grave-index]")) expect(b.getAttribute("aria-label")).not.toContain(MARKER_LABEL_SUFFIX);
  });

  it("marks a grave from pullRequests and names it after the advisory suffix", () => {
    const response: ScanResponse = { ...DEMO, pullRequests: [{ package: PKG, kind: "bump", prUrl: `${PR_PREFIX}4`, timestamp: "2026-11-02T00:00:00.000Z" }] };
    const { container } = render(<Cemetery response={response} theme="dark" reducedMotion={true} />);
    const marked = [...container.querySelectorAll("button[data-grave-index]")].filter((b) => b.getAttribute("aria-label")?.endsWith(MARKER_LABEL_SUFFIX));
    expect(marked).toHaveLength(1);
    expect(marked[0]?.getAttribute("aria-label")).toContain(PKG);
  });
});

describe("the session mark", () => {
  const opened = (): Promise<RemediateView> => Promise.resolve({ status: "opened", prUrl: `${PR_PREFIX}9`, text: "Pull request opened." });
  const labelOf = (container: HTMLElement): string | null =>
    container.querySelector(`button[data-grave-index][aria-label^="${PKG} "]`)?.getAttribute("aria-label") ?? null;

  async function open(container: HTMLElement): Promise<void> {
    fireEvent.click(container.querySelector(`button[data-grave-index][aria-label^="${PKG} "]`) as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: OPEN_PR_TEXT }));
    await waitFor(() => expect(screen.getByText("Pull request opened.")).toBeTruthy());
  }

  it("marks the grave after opened, and clears with a new response", async () => {
    const { container, rerender } = render(<Cemetery key="1" response={HOSTED} theme="dark" reducedMotion={true} onRemediate={opened} />);
    expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(false);
    await open(container);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(true));
    rerender(<Cemetery key="2" response={HOSTED} theme="dark" reducedMotion={true} onRemediate={opened} />);
    expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(false);
  });

  it("marks after existing, and not after refused or failed", async () => {
    for (const status of ["refused", "failed"] as const) {
      const { container, unmount } = render(
        <Cemetery response={HOSTED} theme="dark" reducedMotion={true} onRemediate={() => Promise.resolve({ status, prUrl: null, text: `done ${status}` })} />,
      );
      fireEvent.click(container.querySelector(`button[data-grave-index][aria-label^="${PKG} "]`) as HTMLElement);
      fireEvent.click(screen.getByRole("button", { name: OPEN_PR_TEXT }));
      await waitFor(() => expect(screen.getByText(`done ${status}`)).toBeTruthy());
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(false);
      unmount();
    }
    const { container } = render(
      <Cemetery response={HOSTED} theme="dark" reducedMotion={true} onRemediate={() => Promise.resolve({ status: "existing", prUrl: null, text: "already" })} />,
    );
    fireEvent.click(container.querySelector(`button[data-grave-index][aria-label^="${PKG} "]`) as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: OPEN_PR_TEXT }));
    await waitFor(() => expect(screen.getByText("already")).toBeTruthy());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(true));
  });

  it("plays the burial after the drawer closes, keeps focus on the grave and shows the marker from phase 0.65", async () => {
    let next = 1;
    const queue = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      queue.set(next, cb);
      next += 1;
      return next - 1;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
      queue.delete(id);
    });
    const tick = (ms: number): void => {
      const due = [...queue.values()];
      queue.clear();
      act(() => {
        for (const cb of due) cb(ms);
      });
    };
    const { container } = render(<Cemetery response={HOSTED} theme="dark" reducedMotion={false} onRemediate={opened} />);
    await open(container);
    // The drawer is still open: the burial waits and the marker is held.
    tick(10);
    tick(10 + BURIAL_MS * 2);
    expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(false);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    const grave = container.querySelector(`button[data-grave-index][aria-label^="${PKG} "]`);
    expect(document.activeElement).toBe(grave);
    expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(false);
    tick(100);
    tick(100 + BURIAL_MS * 0.4);
    expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(false);
    tick(100 + BURIAL_MS * 0.8);
    expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(true);
    tick(100 + BURIAL_MS * 1.2);
    expect(document.activeElement).toBe(grave);
    expect(labelOf(container)?.endsWith(MARKER_LABEL_SUFFIX)).toBe(true);
  });
});
