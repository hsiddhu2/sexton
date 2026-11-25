// Summaries and PR body rows of the two new signals. Spec new-signals, Requirements 6.1, 6.2, 6.4. Property 9.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SIGNAL_SUMMARIES } from "../../src/evidence/signal-summary.js";
import { buildPrBody } from "../../src/remediation/pr-body.js";
import { available } from "../../src/signal.js";
import { evaluateState, UNKNOWN_PUBLISHER } from "../../src/state.js";
import type { NewDependencyValue, PackageHealth, PrContext, PublisherChangeValue, PublishRecord, RemediationPlan } from "../../src/types.js";
import { healthySignals } from "../remediation/arbitraries.js";

const AT = "2026-03-31T00:21:58.168Z";
const CHANGED: PublisherChangeValue = {
  status: "changed",
  earlier: { version: "1.14.0", publisher: "GitHub Actions", method: "trusted-publisher", publishTime: "2026-03-27T19:01:40.915Z" },
  installed: { version: "1.14.1", publisher: null, method: "token", publishTime: AT },
};
const ADDED: NewDependencyValue = {
  status: "compared",
  installedVersion: "1.14.1",
  earlierVersion: "1.14.0",
  installedPublishTime: AT,
  addedCount: 1,
  capped: false,
  added: [
    { name: "plain-crypto-js", range: "^4.2.1", resolvedVersion: "4.2.1", resolvedPublishTime: "2026-03-30T23:59:12.278Z", installScript: true, fresh: true },
  ],
};

/** Removes every inline code span; what is left is fixed text. */
function outsideCode(text: string): string {
  return text.replace(/`[^`]*`/g, "");
}

describe("signal summaries (6.1)", () => {
  it("summarises a publisher change and a new dependency in one line", () => {
    expect(SIGNAL_SUMMARIES.publisherChange(CHANGED)).toBe("changed: `GitHub Actions` (trusted-publisher) to unknown (token) in `1.14.1`");
    expect(SIGNAL_SUMMARIES.newDependency(ADDED)).toBe(
      "1 new: `plain-crypto-js` `^4.2.1` -> `4.2.1` (published `2026-03-30T23:59:12.278Z`, install script yes)",
    );
    expect(SIGNAL_SUMMARIES.newDependency({ ...ADDED, addedCount: 0, added: [] })).toBe("none");
    expect(SIGNAL_SUMMARIES.newDependency({ ...ADDED, capped: true, addedCount: 7 })).toMatch(/^7 new: .*, capped at 5$/);
    expect(SIGNAL_SUMMARIES.publisherChange({ status: "no-earlier-version", installed: null })).toBe("no earlier version");
  });
});

describe("Feature: new-signals, Property 9: Escaping", () => {
  it("no string from a value appears outside a code span in the summary or the PR body row", () => {
    // Validates: Requirements 6.4
    const hostile = fc.string({ minLength: 1, maxLength: 20 }).map((s) => `ZQ${s}|\n\`*#`);
    fc.assert(
      fc.property(hostile, hostile, hostile, (a, b, c) => {
        const pc: PublisherChangeValue = {
          status: "changed",
          earlier: { version: a, publisher: b, method: "trusted-publisher", publishTime: c },
          installed: { version: b, publisher: c, method: "token", publishTime: a },
        };
        const nd: NewDependencyValue = {
          status: "compared",
          installedVersion: a,
          earlierVersion: b,
          installedPublishTime: c,
          addedCount: 6,
          capped: true,
          added: [{ name: a, range: b, resolvedVersion: c, resolvedPublishTime: a, installScript: null, fresh: false }],
        };
        for (const text of [SIGNAL_SUMMARIES.publisherChange(pc), SIGNAL_SUMMARIES.newDependency(nd)]) {
          expect(text).not.toContain("\n");
          expect(outsideCode(text)).not.toContain("ZQ");
        }
        const entry: PackageHealth = {
          name: "x",
          installedVersion: "1.0.0",
          state: "Possessed",
          stateReason: "r",
          missingSignals: [],
          signals: { ...healthySignals(), publisherChange: available(pc, "https://registry.npmjs.org/x", new Date(AT)), newDependency: available(nd, "https://registry.npmjs.org/x", new Date(AT)) },
        };
        const plan: RemediationPlan = { packageName: "x", installedVersion: "1.0.0", state: "Possessed", stateReason: "r", kind: "bump", status: "no-safe-version", reason: "none" };
        const context: PrContext = { entry, failingRules: [], generatedAt: AT, engineVersion: "0.2.0" };
        const body = buildPrBody(plan, context);
        for (const name of ["publisherChange", "newDependency"]) {
          const row = body.split("\n").find((l) => l.startsWith(`| \`${name}\` |`));
          expect(row).toBeDefined();
          expect(outsideCode(row ?? "")).not.toContain("ZQ");
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: submission-readiness, Property 3: One word for a missing publisher", () => {
  it("the summary, the PR body row and the state reason say unknown, never no name", () => {
    // Validates: Requirement 5.10
    const name = fc.option(fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,11}$/), { nil: null });
    const method = fc.constantFrom<PublishRecord["method"]>("trusted-publisher", "token", "unknown");
    const status = fc.constantFrom<"changed" | "same" | "unknown">("changed", "same", "unknown");
    fc.assert(
      fc.property(name, name, method, method, status, (a, b, ma, mb, st) => {
        // A "same" summary and its row show only the installed record.
        fc.pre(st === "same" ? b === null : a === null || b === null);
        const pc: PublisherChangeValue = {
          status: st,
          earlier: { version: "1.0.0", publisher: a, method: ma, publishTime: AT },
          installed: { version: "1.0.1", publisher: b, method: mb, publishTime: AT },
        };
        const summary = SIGNAL_SUMMARIES.publisherChange(pc);
        expect(summary).not.toContain("no name");
        expect(outsideCode(summary)).toContain(UNKNOWN_PUBLISHER);
        const entry: PackageHealth = {
          name: "x",
          installedVersion: "1.0.1",
          state: "Possessed",
          stateReason: "r",
          missingSignals: [],
          signals: { ...healthySignals(), publisherChange: available(pc, "https://registry.npmjs.org/x", new Date(AT)) },
        };
        const plan: RemediationPlan = { packageName: "x", installedVersion: "1.0.1", state: "Possessed", stateReason: "r", kind: "bump", status: "no-safe-version", reason: "none" };
        const row = buildPrBody(plan, { entry, failingRules: [], generatedAt: AT, engineVersion: "0.2.0" })
          .split("\n")
          .find((l) => l.startsWith("| `publisherChange` |"));
        expect(row).toBeDefined();
        expect(row).not.toContain("no name");
        expect(outsideCode(row ?? "")).toContain(UNKNOWN_PUBLISHER);
        const reason = evaluateState({ publisherChange: pc }, new Date(AT)).stateReason;
        expect(reason).not.toContain("no name");
        if (st === "changed" && ma === "trusted-publisher" && mb === "token") expect(reason).toContain(UNKNOWN_PUBLISHER);
      }),
      { numRuns: 100 },
    );
  });
});
