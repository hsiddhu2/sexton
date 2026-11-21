// Spec: .kiro/specs/remediation, Requirement 6, property 10.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { branchName } from "../../src/remediation/branch-name.js";
import { createInMemoryRemediationLog } from "../../src/remediation/in-memory-log.js";
import { LOG_REJECTED_REASON } from "../../src/remediation/remediation-log.js";
import { REMEDIATION_KINDS, type RemediationLogEntry } from "../../src/types.js";
import { arbDenseName } from "./arbitraries.js";

const PLANTED = "@@zx@@";

const arbEntry: fc.Arbitrary<RemediationLogEntry> = fc
  .record({
    owner: fc.stringMatching(/^[a-z][a-z0-9-]{0,10}[a-z0-9]$/).filter((s) => !s.includes("--")),
    repo: fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
    name: arbDenseName,
    kind: fc.constantFrom(...REMEDIATION_KINDS),
    n: fc.nat(10000),
    date: fc.date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2030-01-01T00:00:00Z"), noInvalidDate: true }),
  })
  .map((r) => ({
    repository: `https://github.com/${r.owner}/${r.repo}`,
    branch: branchName(r.kind, r.name) ?? "sexton/bump-x",
    prUrl: `https://github.com/${r.owner}/${r.repo}/pull/${String(r.n)}`,
    package: r.name,
    kind: r.kind,
    timestamp: r.date.toISOString(),
  }));

const FAULTS: ((e: RemediationLogEntry) => unknown)[] = [
  () => PLANTED,
  () => null,
  () => [PLANTED],
  (e) => ({ ...e, repository: `https://evil.example/${PLANTED}` }),
  (e) => ({ ...e, branch: `main${PLANTED}` }),
  (e) => ({ ...e, branch: `sexton/..${PLANTED}` }),
  (e) => ({ ...e, prUrl: `http://x/${PLANTED}` }),
  (e) => ({ ...e, prUrl: `https://x/ ${PLANTED}` }),
  (e) => ({ ...e, package: `Bad ${PLANTED}` }),
  (e) => ({ ...e, kind: PLANTED }),
  (e) => ({ ...e, timestamp: PLANTED }),
  (e) => ({ ...e, timestamp: "2026-13-45T99:99:99Z" }),
  (e) => ({ ...e, kind: 7 }),
  (e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "package")),
];

const arbStep: fc.Arbitrary<{ valid: boolean; value: unknown }> = fc.oneof(
  arbEntry.map((e) => ({ valid: true, value: e })),
  fc.tuple(arbEntry, fc.nat(FAULTS.length - 1)).map(([e, i]) => ({ valid: false, value: (FAULTS[i] as (x: RemediationLogEntry) => unknown)(e) })),
  fc.anything().map((value) => ({ valid: false, value })),
);

describe("remediation log", () => {
  it("Feature: remediation, Property 10: The log is append-only", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbStep, { maxLength: 12 }), async (steps) => {
        const log = createInMemoryRemediationLog();
        expect(Object.keys(log).sort()).toEqual(["append", "list"]);
        const model: unknown[] = [];
        for (const step of steps) {
          const before = await log.list();
          const result = await log.append(step.value as RemediationLogEntry);
          if (step.valid) {
            expect(result).toEqual({ ok: true });
            model.push(structuredClone(step.value));
            expect(await log.list()).toEqual([...before, step.value]);
            (step.value as { package: string }).package = "mutated";
          } else {
            expect(result).toEqual({ ok: false, reason: LOG_REJECTED_REASON });
            expect(JSON.stringify(result)).not.toContain(PLANTED);
            expect(await log.list()).toEqual(before);
          }
        }
        const listed = await log.list();
        expect(listed).toEqual(model);
        expect(Object.isFrozen(listed)).toBe(true);
        expect(() => {
          (listed as RemediationLogEntry[]).push(listed[0] as RemediationLogEntry);
        }).toThrow();
        if (listed[0] !== undefined) {
          expect(() => {
            (listed[0] as { kind: string }).kind = "remove";
          }).toThrow();
        }
        expect(await log.list()).toEqual(model);
      }),
      { numRuns: 100 },
    );
  });
});
