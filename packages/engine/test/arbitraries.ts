// Shared fast-check arbitraries for engine tests.

import fc from "fast-check";
import { available, unavailable } from "../src/signal.js";
import type { Snapshot, SnapshotVersion } from "../src/snapshot.js";
import type { StateInputs } from "../src/state.js";
import {
  SEVERITIES,
  type Advisory,
  type MaintainerChangeEvent,
  type MaintainerChangeValue,
  type NewInstallScriptEvent,
  type OriginalSignals,
  type ProvenanceRegressionValue,
  type Signal,
} from "../src/types.js";

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

const namesArb = fc.array(fc.constantFrom("alice", "bob", "carol", "mallory"), { maxLength: 4 });

export const maintainerChangeEventArb: fc.Arbitrary<MaintainerChangeEvent> = fc.record({
  kind: fc.constantFrom<"snapshot-pair" | "live">("snapshot-pair", "live"),
  before: namesArb,
  after: namesArb,
  eventTime: isoArb,
  recent: fc.boolean(),
});

/** Any maintainerChange value: history-insufficient, or sufficient with 0 to 3 events of arbitrary recency. */
export const maintainerChangeValueArb: fc.Arbitrary<MaintainerChangeValue> = fc.oneof(
  fc.constant<MaintainerChangeValue>({ status: "history-insufficient", events: [] }),
  fc
    .array(maintainerChangeEventArb, { maxLength: 3 })
    .map((events): MaintainerChangeValue => ({ status: "history-sufficient", events })),
);

export const provenanceRegressionValueArb: fc.Arbitrary<ProvenanceRegressionValue> = fc.oneof(
  fc.record({
    status: fc.constant("regression" as const),
    installedVersion: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
    earlierVersion: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
    snapshotCaptureTime: isoArb,
  }),
  fc.record({ status: fc.constant("no-regression" as const), snapshotCaptureTime: isoArb }),
  fc.record({ status: fc.constant("history-insufficient" as const), reason: fc.string({ maxLength: 30 }) }),
);

export const newInstallScriptArb: fc.Arbitrary<NewInstallScriptEvent[]> = fc.array(
  fc.record({ version: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/), publishTime: isoArb }),
  { maxLength: 2 },
);

type MutableStateInputs = { -readonly [K in keyof StateInputs]: StateInputs[K] };

/** Ten-signal state inputs. Each of the six new inputs is undefined (unavailable) or generated. */
export const tenSignalInputsArb: fc.Arbitrary<StateInputs> = fc
  .tuple(
    stateInputsArb,
    fc.option(maintainerChangeValueArb, { nil: undefined }),
    fc.option(provenanceRegressionValueArb, { nil: undefined }),
    fc.option(newInstallScriptArb, { nil: undefined }),
  )
  .map(([base, mc, pr, ns]) => {
    const out: MutableStateInputs = { ...base };
    if (mc !== undefined) out.maintainerChange = mc;
    if (pr !== undefined) out.provenanceRegression = pr;
    if (ns !== undefined) out.newInstallScript = ns;
    return out;
  });

/** New inputs that must never change a health-scoring result: absent, insufficient, no-regression, empty or not recent. */
export const inertNewInputsArb: fc.Arbitrary<Pick<StateInputs, "maintainerChange" | "provenanceRegression" | "newInstallScript">> =
  fc
    .tuple(
      fc.option(
        fc.oneof(
          fc.constant<MaintainerChangeValue>({ status: "history-insufficient", events: [] }),
          fc.constant<MaintainerChangeValue>({ status: "history-sufficient", events: [] }),
          fc
            .array(maintainerChangeEventArb.map((e): MaintainerChangeEvent => ({ ...e, recent: false })), { maxLength: 3 })
            .map((events): MaintainerChangeValue => ({ status: "history-sufficient", events })),
        ),
        { nil: undefined },
      ),
      fc.option(
        fc.oneof(
          fc.record({ status: fc.constant("no-regression" as const), snapshotCaptureTime: isoArb }),
          fc.record({ status: fc.constant("history-insufficient" as const), reason: fc.string({ maxLength: 30 }) }),
        ),
        { nil: undefined },
      ),
      fc.option(fc.constant<NewInstallScriptEvent[]>([]), { nil: undefined }),
    )
    .map(([mc, pr, ns]) => {
      const out: MutableStateInputs = {};
      if (mc !== undefined) out.maintainerChange = mc;
      if (pr !== undefined) out.provenanceRegression = pr;
      if (ns !== undefined) out.newInstallScript = ns;
      return out;
    });

export function signalArb<T>(valueArb: fc.Arbitrary<T>): fc.Arbitrary<Signal<T>> {
  return fc.oneof(
    fc.tuple(valueArb, fc.webUrl(), dateArb).map(([v, s, d]) => available(v, s, d)),
    fc.tuple(fc.string({ minLength: 1, maxLength: 40 }), fc.webUrl(), dateArb).map(([r, s, d]) => unavailable(r, s, d)),
  );
}

export const packageSignalsArb: fc.Arbitrary<OriginalSignals> = fc.record({
  lastPublish: signalArb(fc.option(isoArb, { nil: null })),
  deprecated: signalArb(fc.boolean()),
  hasInstallScript: signalArb(fc.boolean()),
  advisories: signalArb(advisoriesArb),
});

const SNAPSHOT_BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");

/** Capture times: a few clustered instants (to force ties) or any date in range, always ISO UTC. */
export const captureTimeArb: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0, max: 6 }).map((k) => new Date(SNAPSHOT_BASE_MS + k * 500).toISOString()),
  fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2027-01-01T00:00:00Z"), noInvalidDate: true }).map((d) => d.toISOString()),
);

export const snapshotVersionArb: fc.Arbitrary<SnapshotVersion> = fc.record({
  version: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
  publishTime: isoArb,
  hasInstallScript: fc.boolean(),
  provenance: fc.constantFrom<boolean | null>(true, false, null),
});

/** A valid Snapshot over a small name alphabet so packages collide often. */
export const arbSnapshot: fc.Arbitrary<Snapshot> = fc.record({
  name: fc.constantFrom("a", "b", "c", "@s/d"),
  captureTime: captureTimeArb,
  maintainers: fc.array(fc.constantFrom("alice", "bob", "carol", "mallory"), { maxLength: 6 }),
  versions: fc.array(snapshotVersionArb, { maxLength: 20 }),
});
