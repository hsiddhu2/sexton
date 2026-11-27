// Spec clean-site, design C8 and requirements 10.7, 10.8, 10.14 to 10.17: what each screen change does to the history.
import { describe, expect, it } from "vitest";
import { historyStep } from "../src/load/history-step.js";
import { initialScreen, reduce, type ScreenEvent, type ScreenState } from "../src/load/screen-state.js";
import { HOME_VIEW, type View } from "../src/load/view-address.js";

const AT = "2026-03-31T00:21:58.168Z";
const REPO: View = { ...HOME_VIEW, source: { kind: "repo", url: "https://github.com/a/b" } };

function stepOf(start: ScreenState, event: ScreenEvent): ReturnType<typeof historyStep> {
  return historyStep(start, reduce(start, event), event);
}

const home = initialScreen(HOME_VIEW);
const drawer = initialScreen({ ...HOME_VIEW, grave: "lodash", at: AT });
const listDrawer = initialScreen({ ...HOME_VIEW, list: true, grave: "lodash" });
const replay = initialScreen({ ...HOME_VIEW, source: { kind: "replay", id: "axios" } });
const guide = initialScreen({ ...REPO, page: "guide" });

describe("historyStep", () => {
  it("pushes a new Source, the Guide page, a Replay, the List switch and the Home action from a Replay or the Guide page (10.7)", () => {
    expect(stepOf(home, { kind: "source", source: REPO.source })).toBe("push");
    expect(stepOf(home, { kind: "open-guide" })).toBe("push");
    expect(stepOf(home, { kind: "open-replay", id: "keyv" })).toBe("push");
    expect(stepOf(home, { kind: "list", on: true })).toBe("push");
    expect(stepOf(replay, { kind: "home" })).toBe("push");
    expect(stepOf(replay, { kind: "escape" })).toBe("push");
    expect(stepOf(guide, { kind: "home" })).toBe("push");
    expect(stepOf(replay, { kind: "open-tour" })).toBe("push");
  });

  it("marks a Drawer open as the Drawer's own entry (10.15)", () => {
    expect(stepOf(home, { kind: "open-drawer", grave: "lodash" })).toBe("drawer");
  });

  it("goes back over the Drawer's entry when it closes onto the view beneath (10.14, 10.17)", () => {
    expect(stepOf(drawer, { kind: "close" })).toBe("back");
    expect(stepOf(drawer, { kind: "escape" })).toBe("back");
    expect(stepOf(drawer, { kind: "home" })).toBe("back");
    expect(stepOf(drawer, { kind: "open-tour" })).toBe("back");
    expect(stepOf(listDrawer, { kind: "home" })).toBe("back");
  });

  it("pushes a new View that opens over the Drawer (the hook replaces the Drawer's entry with it)", () => {
    expect(stepOf(drawer, { kind: "open-guide" })).toBe("push");
    expect(stepOf(drawer, { kind: "source", source: REPO.source })).toBe("push");
    expect(stepOf(listDrawer, { kind: "open-tour" })).toBe("push");
  });

  it("replaces on the scrubber, with or without the Drawer (10.8), and on a Home action that stays on Home", () => {
    expect(stepOf(home, { kind: "date", at: AT })).toBe("replace");
    expect(stepOf(drawer, { kind: "date", at: null })).toBe("replace");
    expect(stepOf(initialScreen({ ...HOME_VIEW, at: AT }), { kind: "home" })).toBe("replace");
    expect(stepOf(initialScreen({ ...REPO, at: AT }), { kind: "source", source: REPO.source })).toBe("replace");
  });

  it("leaves the address alone for a filter, a Pop-over, the Tour and anything that keeps the View (10.16)", () => {
    expect(stepOf(home, { kind: "filter", state: "Dead" })).toBe("none");
    expect(stepOf(home, { kind: "open-popover", popover: "legend" })).toBe("none");
    expect(stepOf(home, { kind: "open-tour" })).toBe("none");
    expect(stepOf(home, { kind: "home" })).toBe("none");
    expect(stepOf(drawer, { kind: "open-popover", popover: "term" })).toBe("none");
  });

  it("never writes for restore: Back, Forward and a page load already name their View", () => {
    expect(stepOf(home, { kind: "restore", view: REPO })).toBe("none");
    expect(stepOf(drawer, { kind: "restore", view: HOME_VIEW })).toBe("none");
  });
});
