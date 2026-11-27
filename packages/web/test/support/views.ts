// Generators of Views (spec clean-site, Property 2), shared by the address and screen-state tests.
import fc from "fast-check";
import type { HomeSource, View } from "../../src/load/view-address.js";
import { REPLAY_IDS } from "../../src/replay/replay-ids.js";

const arbTrimmed = (max: number) => fc.string({ minLength: 1, maxLength: max }).filter((s) => s.trim() === s && s !== "");
export const arbHomeSource: fc.Arbitrary<HomeSource> = fc.oneof(
  fc.constant<HomeSource>({ kind: "demo" }),
  arbTrimmed(200).map((url): HomeSource => ({ kind: "repo", url })),
  fc.string({ maxLength: 80 }).map((address): HomeSource => ({ kind: "scan", address })),
);
export const arbInstant = fc.date({ min: new Date(0), max: new Date(8.64e15 - 1), noInvalidDate: true }).map((d) => d.toISOString());

/** Every canonical View of Property 2. */
export const arbCanonicalView: fc.Arbitrary<View> = fc.oneof(
  fc.constantFrom(...REPLAY_IDS).map((id): View => ({ source: { kind: "replay", id }, page: "home", list: false, grave: null, at: null })),
  fc.constant<View>({ source: { kind: "rejected" }, page: "home", list: false, grave: null, at: null }),
  arbHomeSource.map((source): View => ({ source, page: "guide", list: false, grave: null, at: null })),
  fc.record({
    source: arbHomeSource,
    page: fc.constant<"home">("home"),
    list: fc.boolean(),
    grave: fc.option(fc.string({ minLength: 1, maxLength: 214 }), { nil: null }),
    at: fc.option(arbInstant, { nil: null }),
  }),
);

