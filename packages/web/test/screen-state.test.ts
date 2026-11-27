// Spec clean-site, design C1 and Property 1: one View owner, one Pop-over, and home in one action.
import type { State } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STATES } from "../src/load/lists.js";
import { homeOf, initialScreen, reduce, type Popover, type ScreenEvent, type ScreenState } from "../src/load/screen-state.js";
import { HOME_VIEW, type ViewSource } from "../src/load/view-address.js";
import { REPLAY_IDS } from "../src/replay/replay-ids.js";
import { arbCanonicalView, arbHomeSource, arbInstant } from "./support/views.js";

const POPOVERS = ["legend", "attacks", "examples", "term"] as const satisfies readonly Exclude<Popover, "none">[];

const arbSource: fc.Arbitrary<ViewSource> = fc.oneof(
  arbHomeSource,
  fc.constantFrom(...REPLAY_IDS).map((id): ViewSource => ({ kind: "replay", id })),
  fc.constant<ViewSource>({ kind: "rejected" }),
);

const arbEvent: fc.Arbitrary<ScreenEvent> = fc.oneof(
  fc.constantFrom("a", "lodash", "left-padder").map((grave): ScreenEvent => ({ kind: "open-drawer", grave })),
  fc.constantFrom(...REPLAY_IDS).map((id): ScreenEvent => ({ kind: "open-replay", id })),
  fc.constant<ScreenEvent>({ kind: "open-guide" }),
  fc.constant<ScreenEvent>({ kind: "open-tour" }),
  fc.constantFrom(...POPOVERS).map((popover): ScreenEvent => ({ kind: "open-popover", popover })),
  fc.constant<ScreenEvent>({ kind: "close-popover" }),
  fc.constant<ScreenEvent>({ kind: "close" }),
  fc.constant<ScreenEvent>({ kind: "escape" }),
  fc.constant<ScreenEvent>({ kind: "home" }),
  fc.boolean().map((on): ScreenEvent => ({ kind: "list", on })),
  fc.option(fc.constantFrom<State>(...STATES), { nil: null }).map((state): ScreenEvent => ({ kind: "filter", state })),
  fc.option(arbInstant, { nil: null }).map((at): ScreenEvent => ({ kind: "date", at })),
  fc.constant<ScreenEvent>({ kind: "tour-next" }),
  arbSource.map((source): ScreenEvent => ({ kind: "source", source })),
  arbCanonicalView.map((view): ScreenEvent => ({ kind: "restore", view })),
);

function checkConsistent(s: ScreenState): void {
  expect(s.owner === "drawer", "drawer iff grave").toBe(s.view.grave !== null);
  expect(s.owner === "replay", "replay iff replay Source").toBe(s.view.source.kind === "replay");
  expect(s.owner === "guide", "guide iff page guide").toBe(s.view.page === "guide");
  expect(s.owner === "tour", "tour iff tourStep").toBe(s.tourStep !== null);
  expect(["demo", "repo", "scan"]).toContain(s.homeSource.kind);
}

function checkHome(before: ScreenState, after: ScreenState): void {
  expect(after).toEqual({ ...before, view: homeOf(before), owner: "none", popover: "none", filter: null, tourStep: null });
  const home = homeOf(before);
  expect(home).toEqual({ source: before.homeSource, page: "home", list: before.homeList, grave: null, at: null });
}

function checkStep(before: ScreenState, e: ScreenEvent, after: ScreenState): void {
  const opensOwner = e.kind === "open-drawer" || e.kind === "open-replay" || e.kind === "open-guide" || e.kind === "open-tour";
  if (opensOwner && after !== before) expect(after.popover).toBe("none");
  if (e.kind === "open-popover" && after !== before) {
    expect(after.owner).toBe(before.owner);
    expect(after.view).toEqual(before.view);
    expect(after.popover).toBe(e.popover);
  }
  if (e.kind === "home") checkHome(before, after);
  if (e.kind === "escape") {
    if (before.popover !== "none") expect(after).toEqual({ ...before, popover: "none" });
    else if (before.owner === "tour") expect(after).toEqual({ ...before, owner: "none", tourStep: null });
    else if (before.owner === "drawer") expect(after).toEqual({ ...before, owner: "none", view: { ...before.view, grave: null } });
    else if (before.owner === "replay" || before.owner === "guide") checkHome(before, after);
    else expect(after).toBe(before);
  }
}

describe("Feature: clean-site, Property 1: One View owner, one Pop-over, and home in one action", () => {
  it("keeps the View owner and the View in step, and Escape and home exact, over any 50 events", () => {
    fc.assert(
      fc.property(arbCanonicalView, fc.array(arbEvent, { maxLength: 50 }), (start, events) => {
        let s = initialScreen(start);
        checkConsistent(s);
        for (const e of events) {
          const next = reduce(s, e);
          checkConsistent(next);
          checkStep(s, e, next);
          checkHome(next, reduce(next, { kind: "home" }));
          s = next;
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("screen state examples", () => {
  const home = initialScreen(HOME_VIEW);

  it("opens a Drawer on Home and closes it back to the view beneath (10.14)", () => {
    const listed = reduce(home, { kind: "list", on: true });
    const open = reduce(listed, { kind: "open-drawer", grave: "lodash" });
    expect(open.owner).toBe("drawer");
    expect(open.view).toEqual({ ...HOME_VIEW, list: true, grave: "lodash" });
    const closed = reduce(open, { kind: "close" });
    expect(closed.view).toEqual({ ...HOME_VIEW, list: true });
    expect(closed.owner).toBe("none");
  });

  it("ignores the drawer, list, filter and date while a Replay, the Guide page or the rejected card shows", () => {
    const blocked: readonly ScreenEvent[] = [
      { kind: "open-drawer", grave: "a" },
      { kind: "list", on: true },
      { kind: "filter", state: "Dead" },
      { kind: "date", at: "2026-01-01T00:00:00.000Z" },
    ];
    for (const s of [
      reduce(home, { kind: "open-replay", id: "axios" }),
      reduce(home, { kind: "open-guide" }),
      reduce(home, { kind: "source", source: { kind: "rejected" } }),
      reduce(home, { kind: "open-tour" }),
    ]) {
      for (const e of blocked) expect(reduce(s, e)).toBe(s);
    }
  });

  it("keeps the repo Source as home after a Live scan, through a Replay and the Guide page (10.2)", () => {
    const repo: ViewSource = { kind: "repo", url: "https://github.com/a/b" };
    const scanned = reduce(home, { kind: "source", source: repo });
    const guide = reduce(scanned, { kind: "open-guide" });
    expect(guide.view).toEqual({ source: repo, page: "guide", list: false, grave: null, at: null });
    const replay = reduce(guide, { kind: "open-replay", id: "keyv" });
    expect(reduce(replay, { kind: "escape" }).view).toEqual({ source: repo, page: "home", list: false, grave: null, at: null });
  });

  it("never makes the rejected Source home: its way back reaches the Sample scan", () => {
    const rejected = reduce(home, { kind: "source", source: { kind: "rejected" } });
    expect(rejected.owner).toBe("none");
    expect(rejected.homeSource).toEqual({ kind: "demo" });
    expect(reduce(rejected, { kind: "home" }).view).toEqual(HOME_VIEW);
    expect(initialScreen({ ...HOME_VIEW, source: { kind: "rejected" } }).homeSource).toEqual({ kind: "demo" });
  });

  it("starts the Tour from Home in the Graveyard view and ends it after step 3", () => {
    const s0 = reduce(reduce(reduce(home, { kind: "list", on: true }), { kind: "filter", state: "Dead" }), { kind: "open-tour" });
    expect(s0).toMatchObject({ owner: "tour", tourStep: 0, filter: null, homeList: false, view: HOME_VIEW });
    expect(reduce(s0, { kind: "open-popover", popover: "legend" })).toBe(s0);
    const s2 = reduce(reduce(s0, { kind: "tour-next" }), { kind: "tour-next" });
    expect(s2.tourStep).toBe(2);
    expect(reduce(s2, { kind: "tour-next" })).toMatchObject({ owner: "none", tourStep: null });
  });

  it("closes a Pop-over first, then the Drawer, on Escape (10.3)", () => {
    const open = reduce(reduce(home, { kind: "open-drawer", grave: "a" }), { kind: "open-popover", popover: "term" });
    const first = reduce(open, { kind: "escape" });
    expect(first).toMatchObject({ owner: "drawer", popover: "none" });
    expect(reduce(first, { kind: "escape" })).toMatchObject({ owner: "none", view: HOME_VIEW });
  });

  it("restores the List choice and the Source from an address", () => {
    const s = initialScreen({ source: { kind: "scan", address: "/x.json" }, page: "home", list: true, grave: null, at: null });
    expect(s.homeList).toBe(true);
    expect(s.homeSource).toEqual({ kind: "scan", address: "/x.json" });
  });
});
