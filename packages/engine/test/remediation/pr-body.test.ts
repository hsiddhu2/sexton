// Spec: .kiro/specs/remediation, Requirement 5, properties 7, 12 and 13.

import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeField } from "../../src/remediation/escape-field.js";
import { failingRulesFor } from "../../src/remediation/failing-rules.js";
import {
  buildPrBody,
  LOCKFILE_NOTE,
  MAJOR_UPGRADE_LINE,
  MAX_BODY_CHARS,
  NO_RULE_LINE,
  POSSESSED_WARNING,
  RANGE_STYLE_LINE,
  REMOVE_SCOPE_LINE, REMOVE_CHECK_LINE,
} from "../../src/remediation/pr-body.js";
import { SIGNAL_NAMES, type FailingRule, type PackageHealth, type PrContext, type RemediationPlan, type UnhealthyState } from "../../src/types.js";
import { arbHostileHealth, arbHostileString, arbPolicyResultFor, healthySignals, MARKER, RANGE_MARKER } from "./arbitraries.js";

const UNHEALTHY: readonly UnhealthyState[] = ["Possessed", "Dead", "Haunted"];

/** Removes inline code spans: a backtick, text without a backtick, a backtick. */
function stripSpans(text: string): string {
  return text.replace(/`[^`]*`/g, "");
}

const TEMPLATE_BLOCK_LINES = [/^# Sexton remediation$/, /^\*\*(Package|State|Kind):\*\* /, /^## (Signals|Proposed change|Failing policy rules|Lockfile)$/, /^\| Signal \| Value \| Source \| Fetched at \|$/, /^\|---\|---\|---\|---\|$/, /^\| {2}\| {2}\| {2}\| {2}\|$/, /^> \*\*Warning:\*\*/, /^---$/, /^\d+\. Rule {2}: ?$/, /^\d+\. Rule {3}: ?$/];

function arbPlanFor(name: string, installed: string, state: UnhealthyState, reason: string): fc.Arbitrary<RemediationPlan> {
  const base = { packageName: name, installedVersion: installed, state, stateReason: "x" };
  return fc.oneof(
    fc.constant<RemediationPlan>({ ...base, kind: "bump", status: "proposed", chosenVersion: "2.0.0", majorUpgrade: true, edit: { path: "package.json", op: "set-range", section: "dependencies", name, range: "^2.0.0" } }),
    fc.constant<RemediationPlan>({ ...base, kind: "remove", status: "proposed", edit: { path: "package.json", op: "remove-dependency", section: "devDependencies", name } }),
    fc.constant<RemediationPlan>({ ...base, kind: "migrate", status: "proposed" }),
    fc.constant<RemediationPlan>({ ...base, kind: "bump", status: "no-safe-version", reason }),
    fc.constant<RemediationPlan>({ ...base, kind: "bump", status: "unavailable", reason }),
  );
}

function contextFor(entry: PackageHealth, failingRules: readonly FailingRule[] = [], generatedAt = "2026-11-12T00:00:00.000Z"): PrContext {
  return { entry, failingRules, generatedAt, engineVersion: "0.1.0" };
}

const arbHostileRules = fc.array(
  fc.record({ index: fc.nat(50), type: fc.constantFrom("forbid_state" as const, "max_age_months" as const), name: fc.option(arbHostileString, { nil: undefined }), reason: arbHostileString }),
  { maxLength: 25 },
).map((rules) => rules.map((r): FailingRule => ({ index: r.index, type: r.type, ...(r.name !== undefined ? { name: r.name } : {}), reason: r.reason })));

describe("buildPrBody", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Feature: remediation, Property 7: PR body signal coverage and no echo", () => {
    fc.assert(
      fc.property(
        arbHostileHealth,
        arbHostileRules,
        arbHostileString,
        arbHostileString,
        (health, rules, reason, generatedAt) => {
          const state = UNHEALTHY.includes(health.state as UnhealthyState) ? (health.state as UnhealthyState) : "Dead";
          fc.assert(
            fc.property(arbPlanFor(health.name, health.installedVersion, state, reason), (plan) => {
              const body = buildPrBody({ ...plan, stateReason: health.stateReason }, contextFor(health, rules, generatedAt));
              const lines = body.split("\n");
              for (const name of SIGNAL_NAMES) {
                const s = health.signals[name];
                const row = lines.find((l) => l.startsWith(`| \`${name}\` |`));
                expect(row).toBeDefined();
                expect(row).toContain(escapeField(s.source));
                expect(row).toContain(escapeField(s.fetchedAt));
              }
              const outside = stripSpans(body);
              expect(outside).not.toContain(MARKER);
              expect(body).not.toContain(RANGE_MARKER);
              expect(outside).not.toMatch(/<|\]\(|!\[|&[a-z#0-9]+;|https?:\/\//i);
              for (const line of lines) {
                const bare = stripSpans(line);
                if (/^(#|>|-|\*|\||\d+\.)/.test(bare)) {
                  expect(TEMPLATE_BLOCK_LINES.some((re) => re.test(bare)) || /^\| {2}\| /.test(bare)).toBe(true);
                }
              }
              for (const span of body.match(/`[^`]*`/g) ?? []) expect(span.includes("\n")).toBe(false);
            }),
            { numRuns: 5 },
          );
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("Feature: remediation, Property 12: Body bound and determinism", () => {
    const astral = "😀".repeat(200);
    const big = (n: number): string[] => Array.from({ length: n }, () => astral);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), fc.constantFrom(...UNHEALTHY), (n, state) => {
        const s = healthySignals();
        const at = "2026-01-01T00:00:00.000Z";
        const entry: PackageHealth = {
          name: astral,
          installedVersion: astral,
          state,
          stateReason: astral,
          missingSignals: [],
          signals: {
            ...s,
            lastPublish: { value: astral, source: astral, fetchedAt: astral, available: true },
            advisories: { value: big(n).map((t) => ({ id: t, severity: "High" as const, summary: t })), source: astral, fetchedAt: at, available: true },
            maintainers: { value: big(n), source: astral, fetchedAt: astral, available: true },
            maintainerChange: { value: { status: "history-sufficient", events: big(n).map((t) => ({ kind: "live" as const, before: [t], after: [t], eventTime: t, recent: true })) }, source: astral, fetchedAt: astral, available: true },
            newInstallScript: { value: big(n).map((t) => ({ version: t, publishTime: t })), source: astral, fetchedAt: astral, available: true },
            deprecated: { value: null, source: astral, fetchedAt: astral, available: false, reason: astral },
          },
        };
        const rules = Array.from({ length: 40 }, (_, i): FailingRule => ({ index: i, type: "forbid_state", name: astral, reason: astral }));
        fc.assert(
          fc.property(arbPlanFor(astral, astral, state, astral), (plan) => {
            const ctx = contextFor(entry, rules, astral);
            const body = buildPrBody(plan, ctx);
            expect(body.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
            vi.stubGlobal("Date", function NoDate() {
              throw new Error("clock read");
            });
            expect(buildPrBody(plan, ctx)).toBe(body);
            vi.unstubAllGlobals();
          }),
          { numRuns: 5 },
        );
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 13: Possessed warning and failing rules", () => {
    fc.assert(
      fc.property(arbPolicyResultFor("target"), fc.constantFrom(...UNHEALTHY), (policy, state) => {
        const failing = failingRulesFor(policy, "target");
        const model = policy.rules.filter((r) => !r.pass && r.failures.some((f) => f.name === "target"));
        expect(failing.map((r) => r.index)).toEqual(model.map((r) => r.index));
        const entry: PackageHealth = { name: "target", installedVersion: "1.0.0", state, stateReason: "x", signals: healthySignals(), missingSignals: [] };
        const body = buildPrBody({ packageName: "target", installedVersion: "1.0.0", state, stateReason: "x", kind: "bump", status: "unavailable", reason: "r" }, contextFor(entry, failing));
        expect(body.includes(POSSESSED_WARNING)).toBe(state === "Possessed");
        const listed = body
          .split("\n")
          .map((l) => /^\d+\. Rule `(\d+)`/.exec(l)?.[1])
          .filter((x): x is string => x !== undefined)
          .map(Number);
        expect(listed).toEqual(failing.slice(0, 20).map((r) => r.index));
        if (failing.length === 0) expect(body).toContain(NO_RULE_LINE);
        if (failing.length > 20) expect(body).toContain(`and ${String(failing.length - 20)} more`);
      }),
      { numRuns: 100 },
    );
  });
});

describe("buildPrBody examples", () => {
  const entry: PackageHealth = { name: "request", installedVersion: "2.81.0", state: "Dead", stateReason: "deprecated", signals: healthySignals(), missingSignals: [] };
  const base = { packageName: "request", installedVersion: "2.81.0", state: "Dead" as const, stateReason: "deprecated" };

  it("a bump shows the versions, the style line, the major line, the lockfile note and the footer, never the range", () => {
    const body = buildPrBody(
      { ...base, kind: "bump", status: "proposed", chosenVersion: "3.0.0", majorUpgrade: true, edit: { path: "package.json", op: "set-range", section: "dependencies", name: "request", range: "^3.0.0" } },
      contextFor(entry),
    );
    expect(body).toContain("Bump `request` from `2.81.0` to `3.0.0`.");
    expect(body).toContain(RANGE_STYLE_LINE);
    expect(body).toContain(MAJOR_UPGRADE_LINE);
    expect(body).not.toContain("^3.0.0");
    expect(body).toContain(LOCKFILE_NOTE);
    expect(body.trimEnd().endsWith("Generated by Sexton `0.1.0` from a scan at `2026-11-12T00:00:00.000Z`.")).toBe(true);
    const order = ["# Sexton remediation", "**Package:**", "**State:**", "## Signals", "## Proposed change", "## Failing policy rules", "## Lockfile", "Generated by"].map((s) => body.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("a remove names the section, says every section, and has the lockfile note", () => {
    const body = buildPrBody({ ...base, kind: "remove", status: "proposed", edit: { path: "package.json", op: "remove-dependency", section: "devDependencies", name: "request" } }, contextFor(entry));
    expect(body).toContain("Remove `request`, listed in `devDependencies`.");
    expect(body).toContain(REMOVE_SCOPE_LINE);
    expect(body).toContain(LOCKFILE_NOTE);
    // Spec cli-and-action, Requirement 2.7 (remediation Correction, 21 Nov 2026).
    expect(body).toContain(`${REMOVE_SCOPE_LINE}\n\n${REMOVE_CHECK_LINE}`);
    expect(REMOVE_CHECK_LINE).toBe("No reference to this package was found in the files read. A package loaded by name at run time is not detected. Check before merging.");
  });

  it("no-safe-version says no change proposed with the reason and no lockfile note", () => {
    const body = buildPrBody({ ...base, kind: "bump", status: "no-safe-version", reason: "no safe version found among 0 evaluated candidate versions" }, contextFor(entry));
    expect(body).toContain("No change proposed: `no safe version found among 0 evaluated candidate versions`");
    expect(body).not.toContain(LOCKFILE_NOTE);
    expect(body).not.toContain("<");
  });

  it("unavailable signals show the word unavailable and the reason", () => {
    const signals = { ...healthySignals(), advisories: { value: null, source: "https://api.osv.dev/v1/querybatch", fetchedAt: "t", available: false as const, reason: "HTTP 503" } };
    const body = buildPrBody({ ...base, kind: "bump", status: "unavailable", reason: "r" }, contextFor({ ...entry, signals }));
    expect(body).toContain("| `advisories` | unavailable `HTTP 503` | `https://api.osv.dev/v1/querybatch` | `t` |");
  });
});
