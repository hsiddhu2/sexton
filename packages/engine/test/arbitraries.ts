// Shared fast-check arbitraries for engine tests.

import fc from "fast-check";
import { available, unavailable } from "../src/signal.js";
import type { StateInputs } from "../src/state.js";
import { SEVERITIES, type Advisory, type PackageSignals, type Signal } from "../src/types.js";

export const MIN_DATE = new Date("2000-01-01T00:00:00Z");
export const MAX_DATE = new Date("2040-01-01T00:00:00Z");

export const dateArb: fc.Arbitrary<Date> = fc.date({ min: MIN_DATE, max: MAX_DATE });

export const isoArb: fc.Arbitrary<string> = dateArb.map((d) => d.toISOString());

export const severityArb = fc.constantFrom(...SEVERITIES);

export const advisoryArb: fc.Arbitrary<Advisory> = fc.record({
  id: fc.stringMatching(/^[A-Z]{3,5}-[0-9]{4}-[0-9a-z]{3,6}$/),
  severity: severityArb,
  summary: fc.string({ maxLength: 60 }),
});

export const advisoriesArb: fc.Arbitrary<Advisory[]> = fc.array(advisoryArb, { maxLength: 5 });

/** Inputs to the pure state function. undefined models an unavailable signal. */
export const stateInputsArb: fc.Arbitrary<StateInputs> = fc
  .record({
    lastPublish: fc.option(fc.option(dateArb, { nil: null }), { nil: undefined }),
    deprecated: fc.option(fc.boolean(), { nil: undefined }),
    advisories: fc.option(advisoriesArb, { nil: undefined }),
  })
  .map((r) => {
    const out: { -readonly [K in keyof StateInputs]: StateInputs[K] } = {};
    if (r.lastPublish !== undefined) out.lastPublish = r.lastPublish;
    if (r.deprecated !== undefined) out.deprecated = r.deprecated;
    if (r.advisories !== undefined) out.advisories = r.advisories;
    return out;
  });

export function signalArb<T>(valueArb: fc.Arbitrary<T>): fc.Arbitrary<Signal<T>> {
  return fc.oneof(
    fc.tuple(valueArb, fc.webUrl(), dateArb).map(([v, s, d]) => available(v, s, d)),
    fc.tuple(fc.string({ minLength: 1, maxLength: 40 }), fc.webUrl(), dateArb).map(([r, s, d]) => unavailable(r, s, d)),
  );
}

export const packageSignalsArb: fc.Arbitrary<PackageSignals> = fc.record({
  lastPublish: signalArb(fc.option(isoArb, { nil: null })),
  deprecated: signalArb(fc.boolean()),
  hasInstallScript: signalArb(fc.boolean()),
  advisories: signalArb(advisoriesArb),
});
