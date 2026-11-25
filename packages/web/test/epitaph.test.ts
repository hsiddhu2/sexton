// Spec cemetery-undead, task 6.3: Epitaphs (requirement 7). Property 4.
// The reason templates are the fixed texts of packages/engine/src/state.ts lines 61 to 114, written here as strings:
// web takes no dependency on the Engine (structure.md).
import type { State } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { hereLies, punchline, PUNCHLINES, reasonFamily, type ReasonFamily } from "../src/epitaph/epitaph.js";
import { STATES } from "../src/load/lists.js";

const arbVersion = fc.tuple(fc.nat(30), fc.nat(30), fc.nat(30)).map(([a, b, c]) => `${String(a)}.${String(b)}.${String(c)}`);

/** Each template under its State, with its Reason family and the approved Punchline. */
const TABLE: readonly (readonly [State, fc.Arbitrary<string>, ReasonFamily, string])[] = [
  ["Possessed", fc.constant("maintainer change in the last 90 days"), "maintainer-change", "The keys changed hands. Nobody heard the door."],
  ["Possessed", fc.tuple(arbVersion, arbVersion).map(([a, b]) => `provenance regression: ${a} has no provenance, ${b} had it`), "provenance-regression", "It used to carry papers. This one came without."],
  ["Possessed", arbVersion.map((v) => `install script added in ${v}`), "install-script", "It came back with a script, and it runs before you do."],
  [
    "Possessed",
    fc.tuple(arbVersion, fc.constantFrom("a", "plain-x", "@scope/dep")).map(([v, n]) => `new dependency in ${v}: ${n}`),
    "new-dependency",
    "It brought a new friend along. Check the friend.",
  ],
  [
    "Possessed",
    fc.tuple(arbVersion, fc.constantFrom("GitHub Actions", "alice", "unknown")).map(([v, n]) => `publisher changed in ${v}: GitHub Actions to ${n}`),
    "publisher-change",
    "A new hand signed this one. The pipeline did not.",
  ],
  ["Dead", fc.constant("installed version is deprecated"), "deprecated", "Deprecated, not departed."],
  ["Dead", fc.integer({ min: 1, max: 120 }).map((m) => `no release in ${String(m)} months and an open advisory`), "stale-with-advisory", "Two years without a release, and a hole still open."],
  ["Haunted", fc.constant("advisory of severity High or Critical"), "severe-advisory", "Something serious walks these grounds."],
  ["Restless", fc.constant("all state signals unavailable"), "no-signals", "Nobody could find its records."],
  ["Restless", fc.integer({ min: 1, max: 120 }).map((m) => `no release in ${String(m)} months`), "stale", "Two years of silence. It may just be resting."],
  ["Restless", fc.constant("advisory of severity Moderate or Low"), "minor-advisory", "A small advisory keeps it awake."],
  ["Alive", fc.constant("no rule matched"), "no-rule", "Alive and well, as far as the records show."],
];

describe("Feature: cemetery-undead, Property 4: Punchlines come only from the table and are true of the reason", () => {
  it("Feature: cemetery-undead, Property 4: Punchlines come only from the table and are true of the reason", () => {
    const arbRow = fc.constantFrom(...TABLE).chain(([state, reason, family, line]) => reason.map((r) => ({ state, r, family, line })));
    fc.assert(
      fc.property(arbRow, fc.constantFrom(...STATES), ({ state, r, family, line }, other) => {
        expect(reasonFamily(state, r)).toBe(family);
        expect(punchline(state, r)).toBe(line);
        // A template under the wrong State gives nothing.
        if (other !== state) {
          expect(reasonFamily(other, r)).toBeNull();
          expect(punchline(other, r)).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(fc.constantFrom(...STATES), fc.string({ maxLength: 60 }), (state, reason) => {
        const line = punchline(state, reason);
        expect(line === null).toBe(reasonFamily(state, reason) === null);
        if (line !== null) expect(PUNCHLINES).toContain(line);
      }),
      { numRuns: 100 },
    );
  });

  it("takes no package name: the signature is (state, reason)", () => {
    expectTypeOf(punchline).parameters.toEqualTypeOf<[State, string]>();
    expectTypeOf(punchline).returns.toEqualTypeOf<string | null>();
  });

  it("matches every row of the approved table exactly, once", () => {
    expect(PUNCHLINES).toEqual(TABLE.map((row) => row[3]));
    expect(new Set(PUNCHLINES).size).toBe(PUNCHLINES.length);
  });

  it("names no person or project in any Punchline", () => {
    const forbidden = ["left-padder", "event-stream", "uuid", "request", "left-pad", "node-sass", "lodash", "express", "moment", "colors", "semver", "react", "axios", "keyv", "npm", "GitHub", "jasonsaayman"];
    for (const line of PUNCHLINES) for (const word of forbidden) expect(line.toLowerCase()).not.toContain(word.toLowerCase());
  });

  it("writes Here lies <name> <version>", () => {
    expect(hereLies("left-padder", "1.2.1")).toBe("Here lies left-padder 1.2.1");
  });
});
