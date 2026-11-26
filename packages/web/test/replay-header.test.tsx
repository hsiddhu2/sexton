// Spec cemetery-undead-2, task 4: the replay header labels its two times (A2) and the footer height hook watches
// every footer node (A8). Spec clean-site, task 6.3: the story card and its one-line sources went with the banner;
// the Why card lists the sources (replay-view.test.tsx).
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { usePinnedFooterHeight } from "../src/hooks/use-free-height.js";
import { REPLAY_IDS, replayAddress } from "../src/replay/replay-ids.js";
import { readDemoScanText } from "./support/demo-scan.js";
import { readReplayText } from "./support/replay-fixture.js";

afterEach(cleanup);
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Sexton cemetery";
});

const ORIGIN = "http://localhost";
function mount(search: string): void {
  const fetchFn = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const id = REPLAY_IDS.find((r) => url === `${ORIGIN}${replayAddress(r)}`);
    if (id !== undefined) return Promise.resolve(new Response(readReplayText(id), { status: 200 }));
    if (url.endsWith("/demo/scan.json")) return Promise.resolve(new Response(readDemoScanText(), { status: 200 }));
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  render(<App fetchFn={fetchFn} apiBase="https://api.example" initialSearch={search} pageOrigin={ORIGIN} />);
}
async function ready(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
}
// Spec clean-site, task 3: the header no longer holds the times (16.12 moves the scan time to the site footer). The
// site footer keeps the replay's window end in a time element; task 6.3: the date badge shows the Step time.
const footerTime = (): HTMLElement => document.querySelector<HTMLElement>(".site-footer time") as HTMLElement;
const badge = (): string => document.querySelector(".scene-card .date-badge")?.textContent ?? "";
const stepCards = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>("footer .step-card")];
const slider = (): HTMLInputElement => screen.getByRole("slider", { name: "History date" }) as HTMLInputElement;

describe("a replay's two times (requirement 2)", () => {
  it("keeps the window end in the site footer and the Step time in the date badge at every Step of axios and keyv", async () => {
    for (const id of REPLAY_IDS) {
      mount(`?replay=${id}`);
      await waitFor(() => {
        expect(stepCards().length).toBeGreaterThan(0);
      });
      const scanTime = /"generatedAt":\s*"([^"]+)"/.exec(readReplayText(id))?.[1];
      expect(scanTime).toBeDefined();
      for (const card of stepCards()) {
        fireEvent.click(card);
        expect(footerTime().getAttribute("dateTime")).toBe(scanTime);
        expect(badge()).toBe(document.querySelector(".step-panel .eyebrow-time")?.textContent);
      }
      cleanup();
    }
  });

  it("shows 31 Mar 2026, 00:21 UTC in the badge at the axios Possessed Step, with the window end 31 Mar 2026, 03:29 UTC", async () => {
    mount("?replay=axios");
    await waitFor(() => {
      expect(stepCards()).toHaveLength(3);
    });
    fireEvent.click(stepCards()[1] as HTMLButtonElement);
    expect(footerTime().textContent).toBe("31 Mar 2026, 03:29 UTC");
    expect(badge()).toBe("31 Mar 2026, 00:21 UTC");
  });

  it("keeps the scan time in the site footer and shows the date badge on the demo", async () => {
    mount("");
    await ready();
    expect(footerTime().textContent).toBe("12 Nov 2026, 00:00 UTC");
    fireEvent.change(slider(), { target: { value: slider().min } });
    expect(document.querySelector(".date-badge")?.textContent).toMatch(/^Viewing /);
  });
});

describe("the footer height hook watches every footer node (requirement 16.6)", () => {
  function footer(height: number): HTMLElement {
    const el = document.createElement("footer");
    el.className = "night-footer";
    el.style.position = "sticky";
    el.getBoundingClientRect = () => ({ height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
    document.body.append(el);
    return el;
  }

  it("measures the tallest of two nodes, finds a replaced node again, and follows a size change on the second", () => {
    const first = footer(40);
    const second = footer(60);
    const { result, rerender } = renderHook(({ key }) => usePinnedFooterHeight(1440, key), { initialProps: { key: 1 } });
    expect(result.current).toBe(60);
    // The second node grows; the observer reports it.
    second.getBoundingClientRect = () => ({ height: 90, width: 0, top: 0, left: 0, right: 0, bottom: 90, x: 0, y: 0, toJSON: () => ({}) });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(90);
    // The first node is replaced by a taller one; a new key finds it.
    first.remove();
    second.remove();
    const third = footer(120);
    rerender({ key: 2 });
    expect(result.current).toBe(120);
    third.remove();
  });
});
