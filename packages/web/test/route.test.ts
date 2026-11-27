// Spec home-page, task 1.1 and 1.2: the Route (design C1, Property 1) and the View address on its path (Property 2).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normaliseRepo } from "../src/header/repo-input.js";
import { formatView, HOME_VIEW, parseView, repoParam, type View } from "../src/load/view-address.js";
import { cemeteryPath } from "../src/site/paths.js";
import { CEMETERY_KEYS, routeOf } from "../src/site/route.js";
import { arbCanonicalView } from "./support/views.js";

const arbKey = fc.constantFrom(...CEMETERY_KEYS);
const arbOther = fc.stringMatching(/^[a-z]{1,8}$/).filter((k) => !CEMETERY_KEYS.includes(k));
const arbValue = fc.string({ maxLength: 30 });
/** A query of up to five pairs, some with Cemetery keys and some without, written as a browser would. */
const arbQuery = fc
  .array(fc.tuple(fc.oneof(arbKey, arbOther), arbValue), { maxLength: 5 })
  .map((pairs) => {
    const params = new URLSearchParams();
    for (const [k, v] of pairs) params.append(k, v);
    const text = params.toString();
    return text === "" ? "" : `?${text}`;
  });

describe("Feature: home-page, Property 1: Routes forward old addresses and never throw", () => {
  it("never throws on any path and query", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (path, search) => {
        expect(() => routeOf(path, search)).not.toThrow();
      }),
      { numRuns: 1000 },
    );
  });

  it("forwards an Old address with its query unchanged, to /scan exactly when repo is there and replay is not", () => {
    fc.assert(
      fc.property(arbQuery, fc.constantFrom("/", "/index.html"), (search, path) => {
        const params = new URLSearchParams(search);
        const route = routeOf(path, search);
        if (!CEMETERY_KEYS.some((k) => params.has(k))) {
          expect(route).toEqual(path === "/" ? { kind: "home" } : { kind: "forward", to: "/" });
          return;
        }
        const to = params.has("repo") && !params.has("replay") ? "/scan" : "/cemetery";
        expect(route).toEqual({ kind: "forward", to: `${to}${search}` });
      }),
      { numRuns: 1000 },
    );
  });

  it("never forwards /cemetery or /scan, with or without a trailing slash", () => {
    fc.assert(
      fc.property(fc.constantFrom("/cemetery", "/cemetery/", "/scan", "/scan/"), arbQuery, (path, search) => {
        expect(routeOf(path, search)).toEqual({ kind: "cemetery", search });
      }),
      { numRuns: 1000 },
    );
  });

  it("forwards any other path to /", () => {
    for (const path of ["/foo", "/cemetery/x", "/scans", "", "/Cemetery"]) expect(routeOf(path, "?replay=axios")).toEqual({ kind: "forward", to: "/" });
  });

  it("forwards the README's old addresses (1.4, 1.5)", () => {
    expect(routeOf("/", "?replay=axios")).toEqual({ kind: "forward", to: "/cemetery?replay=axios" });
    expect(routeOf("/", "?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb")).toEqual({ kind: "forward", to: "/scan?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb" });
    expect(routeOf("/", "?page=guide")).toEqual({ kind: "forward", to: "/cemetery?page=guide" });
    expect(routeOf("/", "")).toEqual({ kind: "home" });
    expect(routeOf("/", "?utm_source=x")).toEqual({ kind: "home" });
  });
});

describe("Feature: home-page, Property 2: The View address keeps its path and round-trips", () => {
  it("writes /scan exactly for a Live scan, and round-trips every canonical View", () => {
    fc.assert(
      fc.property(arbCanonicalView, (view: View) => {
        expect(cemeteryPath(view)).toBe(view.source.kind === "repo" ? "/scan" : "/cemetery");
        expect(parseView(formatView(view), true)).toEqual(view);
      }),
      { numRuns: 100 },
    );
  });

  const arbOwner = fc.stringMatching(/^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,10}$/);
  const arbName = fc.stringMatching(/^[A-Za-z0-9._-]{1,20}$/).filter((n) => n !== "." && n !== ".." && !/\.git$/i.test(n));

  it("writes a Live scan's repo as owner/name, and reads a github.com link as the same repository", () => {
    fc.assert(
      fc.property(arbOwner, arbName, fc.constantFrom("https://github.com/", "http://www.github.com/", "github.com/", ""), (owner, name, prefix) => {
        const url = `https://github.com/${owner}/${name}`;
        const view: View = { ...HOME_VIEW, source: { kind: "repo", url } };
        expect(formatView(view)).toBe(`?repo=${owner}/${name}`);
        expect(repoParam(url)).toBe(`${owner}/${name}`);
        const fromLink = parseView(`?repo=${encodeURIComponent(`${prefix}${owner}/${name}`)}`, true);
        expect(fromLink.source).toEqual({ kind: "repo", url });
        expect(normaliseRepo(repoParam(url))).toEqual({ ok: true, url, label: `${owner}/${name}` });
      }),
      { numRuns: 100 },
    );
  });

  it("keeps a repo value header/repo-input.ts refuses as it was given", () => {
    const view = parseView("?repo=not%20a%20repo", true);
    expect(view.source).toEqual({ kind: "repo", url: "not a repo" });
    expect(formatView(view)).toBe("?repo=not+a+repo");
  });
});
