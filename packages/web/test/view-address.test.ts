// Spec calm-first-visit, requirement 8, extended by spec clean-site (design C8, Property 2): the View address
// round-trips for every canonical View, never throws, follows its precedence and drops parts a view does not take.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canonicalView,
  formatView,
  HOME_VIEW,
  isHome,
  parseView,
  sameSource,
  type View,
  type ViewSource,
} from "../src/load/view-address.js";
import { REPLAY_IDS } from "../src/replay/replay-ids.js";
import { arbCanonicalView, arbHomeSource, arbInstant } from "./support/views.js";

const arbSource: fc.Arbitrary<ViewSource> = fc.oneof(
  arbHomeSource,
  fc.constantFrom(...REPLAY_IDS).map((id): ViewSource => ({ kind: "replay", id })),
  fc.constant<ViewSource>({ kind: "rejected" }),
);
const arbAnyView: fc.Arbitrary<View> = fc.record({
  source: arbSource,
  page: fc.constantFrom<"home" | "guide">("home", "guide"),
  list: fc.boolean(),
  grave: fc.option(fc.string({ minLength: 1, maxLength: 214 }), { nil: null }),
  at: fc.option(arbInstant, { nil: null }),
});

function isCanonical(view: View): boolean {
  const s = view.source;
  if (s.kind === "replay" || s.kind === "rejected") return view.page === "home" && !view.list && view.grave === null && view.at === null;
  if (view.page === "guide") return !view.list && view.grave === null && view.at === null;
  return true;
}

describe("Feature: clean-site, Property 2: The View address round-trips and never throws", () => {
  it("parsing the address formatted from a canonical View gives that View", () => {
    fc.assert(
      fc.property(arbCanonicalView, (view) => {
        expect(parseView(formatView(view), true)).toEqual(view);
      }),
      { numRuns: 100 },
    );
  });

  it("returns a canonical View for any string and never throws", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), fc.boolean(), (search, hosted) => {
        const view = parseView(search, hosted);
        expect(["demo", "replay", "repo", "scan", "rejected"]).toContain(view.source.kind);
        expect(isCanonical(view)).toBe(true);
        expect(canonicalView(view)).toEqual(view);
      }),
      { numRuns: 100 },
    );
  });

  it("formats any View as its canonical form, dropping the parts its view does not take (10.9)", () => {
    fc.assert(
      fc.property(arbAnyView, (view) => {
        const canonical = canonicalView(view);
        expect(isCanonical(canonical)).toBe(true);
        expect(formatView(view)).toBe(formatView(canonical));
        expect(parseView(formatView(view), true)).toEqual(canonical);
      }),
      { numRuns: 100 },
    );
  });

  it("gives the Demo for a bad repo or no API base when there is no replay key", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(""), fc.constant("   "), fc.string({ minLength: 201, maxLength: 260 }).filter((s) => s.trim().length > 200)), (bad) => {
        expect(parseView(`?${new URLSearchParams({ repo: bad }).toString()}`, true).source).toEqual({ kind: "demo" });
      }),
      { numRuns: 100 },
    );
    expect(parseView("?repo=a&repo=b", true).source).toEqual({ kind: "demo" });
    expect(parseView("?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb", false).source).toEqual({ kind: "demo" });
  });

  it("lets any replay key win over repo and scan, and gives the rejected Source for a value outside the set", () => {
    expect(parseView("?replay=axios&repo=x&scan=/y.json", true).source).toEqual({ kind: "replay", id: "axios" });
    expect(parseView("?replay=nope&repo=x", true)).toEqual({ source: { kind: "rejected" }, page: "home", list: false, grave: null, at: null });
    expect(parseView("?replay=&repo=x", true).source).toEqual({ kind: "rejected" });
    expect(parseView("?replay=axios&replay=keyv", true).source).toEqual({ kind: "rejected" });
    expect(parseView("?repo=x&scan=/y.json", true).source).toEqual({ kind: "repo", url: "x" });
  });
});

describe("view address details", () => {
  it("formats the Home view as no query", () => {
    expect(formatView(HOME_VIEW)).toBe("");
    expect(parseView("", true)).toEqual(HOME_VIEW);
    expect(isHome(HOME_VIEW)).toBe(true);
    expect(isHome({ ...HOME_VIEW, list: true })).toBe(false);
    expect(isHome({ ...HOME_VIEW, page: "guide" })).toBe(false);
  });

  it("drops a repeated grave, an empty grave and an at that is not an exact ISO instant", () => {
    expect(parseView("?grave=a&grave=b", true).grave).toBeNull();
    expect(parseView("?grave=", true).grave).toBeNull();
    expect(parseView("?at=2026-03-31", true).at).toBeNull();
    expect(parseView("?at=2026-03-31T00%3A21%3A58.000Z", true).at).toBe("2026-03-31T00:21:58.000Z");
  });

  it("trims a repo value", () => {
    expect(parseView("?repo=%20https%3A%2F%2Fgithub.com%2Fa%2Fb%20", true).source).toEqual({ kind: "repo", url: "https://github.com/a/b" });
  });

  it("reads page=guide and view=list only as single exact values", () => {
    expect(parseView("?page=guide", true).page).toBe("guide");
    expect(parseView("?page=Guide", true).page).toBe("home");
    expect(parseView("?page=guide&page=guide", true).page).toBe("home");
    expect(parseView("?view=list", true).list).toBe(true);
    expect(parseView("?view=grid", true).list).toBe(false);
  });

  it("keeps only the Source and page on the Guide page, and only the Source on a replay", () => {
    expect(parseView("?repo=x&page=guide&view=list&grave=a&at=2026-03-31T00%3A21%3A58.000Z", true)).toEqual({
      source: { kind: "repo", url: "x" },
      page: "guide",
      list: false,
      grave: null,
      at: null,
    });
    expect(parseView("?replay=keyv&page=guide&view=list&grave=keyv", true)).toEqual({
      source: { kind: "replay", id: "keyv" },
      page: "home",
      list: false,
      grave: null,
      at: null,
    });
  });

  it("writes the parts in the order replay, repo, scan, page, view, grave, at", () => {
    const at = "2026-03-31T00:21:58.000Z";
    expect(formatView({ source: { kind: "repo", url: "u" }, page: "home", list: true, grave: "g", at })).toBe(`?repo=u&view=list&grave=g&at=${encodeURIComponent(at)}`);
    expect(formatView({ source: { kind: "repo", url: "u" }, page: "guide", list: false, grave: null, at: null })).toBe("?repo=u&page=guide");
    expect(formatView({ source: { kind: "demo" }, page: "guide", list: false, grave: null, at: null })).toBe("?page=guide");
  });

  it("compares Sources by what they load", () => {
    expect(sameSource({ kind: "demo" }, { kind: "demo" })).toBe(true);
    expect(sameSource({ kind: "replay", id: "axios" }, { kind: "replay", id: "keyv" })).toBe(false);
    expect(sameSource({ kind: "repo", url: "a" }, { kind: "repo", url: "a" })).toBe(true);
    expect(sameSource({ kind: "scan", address: "/a" }, { kind: "demo" })).toBe(false);
  });
});
