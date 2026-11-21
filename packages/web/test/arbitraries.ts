// Shared generators. Typed against @sexton/api's contract, never against engine test helpers.
import type { PackageHealth, PolicyResult, RemediationEntry, ScanResponse, Severity, State } from "@sexton/api";
import fc from "fast-check";
import { REMEDIATION_KINDS, REMEDIATION_STATUSES, RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATES } from "../src/load/lists.js";

export const FAULT_MARKER = "@@marker-8f3a@@";

export const arbState: fc.Arbitrary<State> = fc.constantFrom(...STATES);
export const arbSeverity: fc.Arbitrary<Severity> = fc.constantFrom(...SEVERITIES);

export const arbIsoDate: fc.Arbitrary<string> = fc
  .date({ min: new Date("2015-01-01T00:00:00Z"), max: new Date("2030-01-01T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString());

/** A small alphabet with scoped forms, so name collisions occur. */
export const arbName: fc.Arbitrary<string> = fc.stringMatching(/^(@[a-c]\/)?[a-d][a-d0-9-]{0,5}$/);

const arbWord = fc.stringMatching(/^[a-z]{1,8}$/);

type Json = Record<string, unknown>;

function availableValue(name: string): fc.Arbitrary<unknown> {
  switch (name) {
    case "lastPublish":
      return fc.option(arbIsoDate, { nil: null });
    case "deprecated":
    case "hasInstallScript":
      return fc.boolean();
    case "advisories":
      return fc.array(
        fc.record({ id: arbWord.map((w) => `GHSA-${w}`), severity: arbSeverity, summary: arbWord }),
        { maxLength: 4 },
      );
    case "maintainers":
      return fc.array(arbWord, { maxLength: 3 });
    case "provenance":
      return fc.record({ present: fc.boolean(), predicateType: fc.option(arbWord, { nil: null }) });
    case "transitiveReach":
      return fc.record({ reach: fc.integer({ min: 0, max: 50 }), graphsMissing: fc.nat(3) });
    case "maintainerChange":
      return fc.constant({ status: "history-insufficient", events: [] });
    case "provenanceRegression":
      return arbIsoDate.map((t) => ({ status: "no-regression", snapshotCaptureTime: t }));
    default:
      return fc.array(fc.record({ version: arbWord, publishTime: arbIsoDate }), { maxLength: 2 });
  }
}

export function arbEnvelope(name: string): fc.Arbitrary<Json> {
  const available = fc.record({
    value: availableValue(name),
    source: arbWord.map((w) => `https://registry.example/${w}`),
    fetchedAt: arbIsoDate,
    available: fc.constant(true),
  });
  const unavailable = fc.record({
    value: fc.constant(null),
    source: arbWord.map((w) => `https://registry.example/${w}`),
    fetchedAt: arbIsoDate,
    available: fc.constant(false),
    reason: arbWord,
  });
  return fc.oneof(available, unavailable);
}

/** One package with a given name. All ten signals; missingSignals matches unavailability. */
export function arbPackageNamed(name: string): fc.Arbitrary<PackageHealth> {
  return fc
    .tuple(arbState, arbWord, arbWord, ...SIGNAL_NAMES.map((n) => arbEnvelope(n)))
    .map(([state, version, reason, ...envelopes]) => {
      const signals: Json = {};
      const missing: string[] = [];
      SIGNAL_NAMES.forEach((signalName, i) => {
        const env = envelopes[i] as Json;
        signals[signalName] = env;
        if (env["available"] === false) missing.push(signalName);
      });
      return {
        name,
        installedVersion: `1.${version.length}.0`,
        state,
        stateReason: reason,
        signals,
        missingSignals: missing,
      } as unknown as PackageHealth;
    });
}

export const arbPackage: fc.Arbitrary<PackageHealth> = arbName.chain((n) => arbPackageNamed(n));

/** 0 to max packages with unique names. */
export function arbPackages(max: number): fc.Arbitrary<PackageHealth[]> {
  return fc
    .uniqueArray(arbName, { minLength: 0, maxLength: max })
    .chain((names) => (names.length === 0 ? fc.constant([]) : fc.tuple(...names.map((n) => arbPackageNamed(n)))))
    .map((list) => [...list]);
}

export function arbPolicyResult(names: readonly string[]): fc.Arbitrary<PolicyResult> {
  const arbFailure = fc.record({
    name: names.length === 0 ? arbWord : fc.constantFrom(...names),
    installedVersion: arbWord,
    signal: fc.constant("state"),
    value: arbWord,
    source: fc.constant(null),
    fetchedAt: arbIsoDate,
    reason: arbWord,
  });
  const arbRule = fc.record({
    type: fc.constantFrom(...RULE_TYPES),
    failures: fc.array(arbFailure, { maxLength: 2 }),
  });
  return fc
    .record({ source: fc.constantFrom("default", "file"), rules: fc.array(arbRule, { maxLength: 4 }) })
    .map(({ source, rules }) => {
      const full = rules.map((r, index) => ({
        index,
        type: r.type,
        pass: r.failures.length === 0,
        failures: r.failures,
        unevaluated: [],
        notFound: [],
      }));
      return { source, pass: full.every((r) => r.pass), rules: full } as unknown as PolicyResult;
    });
}

export function arbRemediations(names: readonly string[]): fc.Arbitrary<RemediationEntry[]> {
  if (names.length === 0) return fc.constant([]);
  return fc
    .uniqueArray(fc.constantFrom(...names), { maxLength: 3 })
    .chain((picked) =>
      picked.length === 0
        ? fc.constant([])
        : fc.tuple(
            ...picked.map((packageName) =>
              fc.record(
                {
                  packageName: fc.constant(packageName),
                  kind: fc.constantFrom(...REMEDIATION_KINDS),
                  status: fc.constantFrom(...REMEDIATION_STATUSES),
                  title: arbWord,
                  summary: arbWord,
                  prBody: arbWord,
                  chosenVersion: arbWord,
                  majorUpgrade: fc.boolean(),
                  intent: arbWord.map((w) => ({
                    branch: `sexton/bump-${w}`,
                    title: w,
                    body: w,
                    files: [{ path: "package.json" as const, op: "remove-dependency" as const, section: "dependencies" as const, name: packageName }] as const,
                    baseRef: "@default" as const,
                  })),
                },
                { requiredKeys: ["packageName", "kind", "status", "title", "summary", "prBody"] },
              ),
            ),
          ),
    )
    .map((list) => [...list]);
}

const arbScanMeta = fc.record({
  repo: arbWord.map((w) => ({ owner: "o", repo: w, url: `https://github.com/o/${w}` })),
  unlocked: fc.boolean(),
  unlockedPackages: fc.array(arbWord, { maxLength: 3 }),
  lockfileVersion: fc.constantFrom(1, 2, 3, null),
  capped: fc.boolean(),
  totalDirect: fc.nat(400),
  skipped: fc.constant({ peer: 0, optional: 0, invalidName: 0 }),
  unresolved: fc.constant([]),
});

function assemble(
  packages: PackageHealth[],
  generatedAt: string,
  scan: unknown,
  policy: PolicyResult,
  remediations: RemediationEntry[] | null,
  extras: boolean,
): ScanResponse {
  const report: Json = { generatedAt, packages };
  if (scan !== null) report["scan"] = scan;
  const root: Json = { report, policy };
  if (remediations !== null) root["remediations"] = remediations;
  if (extras) {
    root["unknownTop"] = { nested: [1, 2] };
    report["unknownReport"] = "x";
    if (packages.length > 0) (packages[0] as unknown as Json)["unknownPkg"] = true;
  }
  return root as unknown as ScanResponse;
}

export const arbScanResponse: fc.Arbitrary<ScanResponse> = arbPackages(12).chain((packages) => {
  const names = packages.map((p) => p.name);
  return fc
    .tuple(
      arbIsoDate,
      fc.option(arbScanMeta, { nil: null }),
      arbPolicyResult(names),
      fc.option(arbRemediations(names), { nil: null }),
      fc.boolean(),
    )
    .map(([generatedAt, scan, policy, remediations, extras]) =>
      assemble(packages, generatedAt, scan, policy, remediations, extras),
    );
});

/** A cheap deterministic package for size cases and fault templates. */
export function cheapPackage(name: string, state: State): PackageHealth {
  const envelope = (value: unknown): Json => ({
    value,
    source: "https://registry.example/x",
    fetchedAt: "2026-11-12T00:00:00.000Z",
    available: true,
  });
  const values: Record<string, unknown> = {
    lastPublish: "2026-01-01T00:00:00.000Z",
    deprecated: false,
    hasInstallScript: false,
    advisories: [],
    maintainers: ["a"],
    provenance: { present: false, predicateType: null },
    transitiveReach: { reach: 1, graphsMissing: 0 },
    maintainerChange: { status: "history-insufficient", events: [] },
    provenanceRegression: { status: "no-regression", snapshotCaptureTime: "2026-11-12T00:00:00.000Z" },
    newInstallScript: [],
  };
  const signals: Json = {};
  for (const n of SIGNAL_NAMES) signals[n] = envelope(values[n]);
  return { name, installedVersion: "1.0.0", state, stateReason: "r", signals, missingSignals: [] } as unknown as PackageHealth;
}

export function cheapScan(count: number): ScanResponse {
  const packages = Array.from({ length: count }, (_, i) => cheapPackage(`pkg-${i}`, STATES[i % STATES.length] ?? "Alive"));
  return {
    report: { generatedAt: "2026-11-12T00:00:00.000Z", packages },
    policy: { source: "default", pass: true, rules: [] },
  } as unknown as ScanResponse;
}

export const arbBigScanResponse: fc.Arbitrary<ScanResponse> = fc.constantFrom(0, 1, 60, 61, 300).map(cheapScan);

// ---- faults (requirement 1.13) ----

export const FAULT_KINDS = [
  "missing-field",
  "wrong-type",
  "unknown-state",
  "unknown-severity",
  "bad-date",
  "duplicate-name",
  "duplicate-remediation",
  "available-false-with-value",
  "too-many",
] as const;
export type FaultKind = (typeof FAULT_KINDS)[number];

type Seg = string | number;
const pointer = (segs: readonly Seg[]): string => segs.map((s) => `/${String(s)}`).join("");

function parentOf(root: unknown, segs: readonly Seg[]): Json {
  let cur = root as Json;
  for (const s of segs.slice(0, -1)) cur = cur[String(s)] as Json;
  return cur;
}
function setAt(root: unknown, segs: readonly Seg[], value: unknown): void {
  parentOf(root, segs)[String(segs[segs.length - 1])] = value;
}
function deleteAt(root: unknown, segs: readonly Seg[]): void {
  Reflect.deleteProperty(parentOf(root, segs), String(segs[segs.length - 1]));
}

/** Applies one fault to a deep copy. Returns the broken value and the expected faulty pointer. */
export function applyFault(response: ScanResponse, kind: FaultKind, position: number): { broken: unknown; path: string } {
  const copy = structuredClone(response) as unknown as Json;
  copy[FAULT_MARKER] = FAULT_MARKER; // unknown key, must never reach an error
  const report = copy["report"] as Json;
  const packages = report["packages"] as unknown as Json[];
  const pick = <T>(list: readonly T[]): T => list[position % list.length] as T;
  const ensurePackage = (): void => {
    if (packages.length === 0) packages.push(cheapPackage("zz-fault", "Alive") as unknown as Json);
  };

  switch (kind) {
    case "missing-field": {
      const candidates: Seg[][] = [["report", "generatedAt"], ["report", "packages"], ["policy", "pass"], ["policy", "source"], ["policy", "rules"]];
      const rules = (copy["policy"] as Json)["rules"] as unknown[];
      if (rules.length > 0) candidates.push(["policy", "rules", position % rules.length, "type"]);
      packages.forEach((_, i) => {
        for (const f of ["name", "installedVersion", "state", "stateReason", "missingSignals", "signals"]) {
          candidates.push(["report", "packages", i, f]);
        }
        for (const n of SIGNAL_NAMES) for (const f of ["available", "source", "fetchedAt"]) candidates.push(["report", "packages", i, "signals", n, f]);
      });
      const segs = pick(candidates);
      deleteAt(copy, segs);
      return { broken: copy, path: pointer(segs) };
    }
    case "wrong-type": {
      const candidates: { segs: Seg[]; value: unknown }[] = [
        { segs: ["report", "generatedAt"], value: 5 },
        { segs: ["report", "packages"], value: {} },
        { segs: ["policy", "pass"], value: "yes" },
        { segs: ["policy", "rules"], value: "none" },
      ];
      packages.forEach((_, i) => {
        candidates.push({ segs: ["report", "packages", i, "name"], value: 5 });
        candidates.push({ segs: ["report", "packages", i, "stateReason"], value: 5 });
        candidates.push({ segs: ["report", "packages", i, "missingSignals"], value: "x" });
        for (const n of SIGNAL_NAMES) {
          candidates.push({ segs: ["report", "packages", i, "signals", n, "available"], value: "true" });
          candidates.push({ segs: ["report", "packages", i, "signals", n, "source"], value: 5 });
        }
      });
      const c = pick(candidates);
      setAt(copy, c.segs, c.value);
      return { broken: copy, path: pointer(c.segs) };
    }
    case "unknown-state": {
      ensurePackage();
      const i = position % packages.length;
      const segs: Seg[] = ["report", "packages", i, "state"];
      setAt(copy, segs, FAULT_MARKER);
      return { broken: copy, path: pointer(segs) };
    }
    case "unknown-severity": {
      packages.push(cheapPackage("zz-severity", "Alive") as unknown as Json);
      const i = packages.length - 1;
      const segs: Seg[] = ["report", "packages", i, "signals", "advisories", "value"];
      setAt(copy, segs, [{ id: "x", summary: "y", severity: FAULT_MARKER }]);
      return { broken: copy, path: pointer([...segs, 0, "severity"]) };
    }
    case "bad-date": {
      const candidates: Seg[][] = [["report", "generatedAt"]];
      packages.forEach((_, i) => {
        for (const n of SIGNAL_NAMES) candidates.push(["report", "packages", i, "signals", n, "fetchedAt"]);
      });
      const segs = pick(candidates);
      setAt(copy, segs, FAULT_MARKER);
      return { broken: copy, path: pointer(segs) };
    }
    case "duplicate-name": {
      while (packages.length < 2) packages.push(cheapPackage(`zz-dup-${packages.length}`, "Alive") as unknown as Json);
      const lo = position % (packages.length - 1);
      const hi = lo + 1 + (position % (packages.length - lo - 1));
      const source = packages[lo] as Json;
      setAt(copy, ["report", "packages", hi, "name"], source["name"]);
      return { broken: copy, path: pointer(["report", "packages", hi, "name"]) };
    }
    case "duplicate-remediation": {
      const entry = (n: string): Json => ({ packageName: n, kind: "bump", title: "t", prBody: "b" });
      copy["remediations"] = [entry("zz-a"), entry("zz-a")];
      return { broken: copy, path: pointer(["remediations", 1, "packageName"]) };
    }
    case "available-false-with-value": {
      ensurePackage();
      const i = position % packages.length;
      const n = SIGNAL_NAMES[position % SIGNAL_NAMES.length] ?? "deprecated";
      const base: Seg[] = ["report", "packages", i, "signals", n];
      setAt(copy, [...base, "available"], false);
      setAt(copy, [...base, "value"], FAULT_MARKER);
      setAt(copy, [...base, "reason"], "r");
      return { broken: copy, path: pointer([...base, "value"]) };
    }
    case "too-many": {
      while (packages.length < 301) packages.push(cheapPackage(`zz-many-${packages.length}`, "Alive") as unknown as Json);
      return { broken: copy, path: "/report/packages" };
    }
  }
}

export const arbFault = fc
  .record({ response: arbScanResponse, kind: fc.constantFrom(...FAULT_KINDS), position: fc.nat(1000) })
  .map((r) => ({ ...r, ...applyFault(r.response, r.kind, r.position) }));

// ---- arbitrary JSON ----

function deepNested(depth: number): unknown {
  let v: unknown = { reach: 1 };
  for (let i = 0; i < depth; i += 1) v = i % 2 === 0 ? { report: v } : [v];
  return v;
}

const KEYS = ["report", "policy", "packages", "signals", "__proto__", "constructor", "remediations", "scan", "rules"] as const;

export const arbJson: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 20, arbitrary: fc.jsonValue() },
  { weight: 20, arbitrary: fc.object({ key: fc.constantFrom(...KEYS), maxDepth: 4 }) },
  { weight: 10, arbitrary: fc.integer({ min: 1, max: 200 }).map(deepNested) },
  { weight: 10, arbitrary: arbScanResponse },
  { weight: 10, arbitrary: arbFault.map((f) => f.broken) },
  { weight: 1, arbitrary: fc.string({ minLength: 100000, maxLength: 200000 }) },
);

export const arbHostile: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "https://evil.example/x",
    "{{7*7}}",
    "$(rm -rf /)",
    "\u0000\u001f\u202e",
    "\"'><svg onload=1>",
  ),
  fc.string(),
);

// ---- triage (task 4) ----

const arbTriageState: fc.Arbitrary<State> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom<State>("Possessed", "Dead") },
  { weight: 3, arbitrary: arbState },
);

/** Package with a chosen name and triage-relevant signals: advisories 0 to 4 or unavailable, reach 0 to 50 or unavailable. */
export function arbTriagePackageNamed(name: string): fc.Arbitrary<PackageHealth> {
  const arbAdvisories = fc.option(
    fc.array(arbSeverity, { maxLength: 4 }).map((sevs) => sevs.map((severity, i) => ({ id: `GHSA-${i}`, severity, summary: "s" }))),
    { nil: null },
  );
  const arbReach = fc.option(fc.integer({ min: 0, max: 50 }), { nil: null });
  return fc.tuple(arbTriageState, arbAdvisories, arbReach).map(([state, advisories, reach]) => {
    const pkg = cheapPackage(name, state) as unknown as { signals: Record<string, Json> };
    const unavailable = (): Json => ({ value: null, source: "https://registry.example/x", fetchedAt: "2026-11-12T00:00:00.000Z", available: false, reason: "r" });
    if (advisories === null) pkg.signals["advisories"] = unavailable();
    else (pkg.signals["advisories"] as Json)["value"] = advisories;
    if (reach === null) pkg.signals["transitiveReach"] = unavailable();
    else (pkg.signals["transitiveReach"] as Json)["value"] = { reach, graphsMissing: 0 };
    return pkg as unknown as PackageHealth;
  });
}

/** 0 to max packages with unique names and tie-prone triage keys. */
export function arbTriagePackages(max: number): fc.Arbitrary<PackageHealth[]> {
  return fc
    .uniqueArray(arbName, { minLength: 0, maxLength: max })
    .chain((names) => (names.length === 0 ? fc.constant([]) : fc.tuple(...names.map((n) => arbTriagePackageNamed(n)))))
    .map((list) => [...list]);
}

// ---- scene (task 5) ----

export const arbTheme: fc.Arbitrary<"light" | "dark"> = fc.constantFrom("light", "dark");

/** Names with astral characters near the 15-unit cut, never a lone surrogate. */
export const arbSceneName: fc.Arbitrary<string> = fc
  .array(fc.oneof(fc.constantFrom("😀", "𝒜", "é", "a", "-"), fc.stringMatching(/^[a-z]$/)), { maxLength: 24 })
  .map((parts) => parts.join(""));

export type AdvisoryMode = "none" | "some" | "unavailable";
export const arbAdvisoryMode: fc.Arbitrary<AdvisoryMode> = fc.constantFrom<AdvisoryMode>("none", "some", "unavailable");

/** A cheap package with a chosen state and advisories mode. */
export function scenePackage(name: string, state: State, mode: AdvisoryMode, reach = 1): PackageHealth {
  const pkg = cheapPackage(name, state) as unknown as { signals: Record<string, Json> };
  const advisories = pkg.signals["advisories"] as Json;
  if (mode === "some") advisories["value"] = [{ id: "GHSA-x", severity: "High", summary: "s" }];
  if (mode === "unavailable") {
    pkg.signals["advisories"] = { value: null, source: "https://registry.example/x", fetchedAt: "2026-11-12T00:00:00.000Z", available: false, reason: "r" };
  }
  (pkg.signals["transitiveReach"] as Json)["value"] = { reach, graphsMissing: 0 };
  return pkg as unknown as PackageHealth;
}

/** 0 to n packages (count drawn from the given sizes), names not unique. */
export function arbScenePackages(sizes: readonly number[] = [0, 1, 59, 60, 61, 300]): fc.Arbitrary<PackageHealth[]> {
  return fc.constantFrom(...sizes).chain((n) =>
    fc
      .array(fc.tuple(arbSceneName, arbState, arbAdvisoryMode), { minLength: n, maxLength: n })
      .map((rows) => rows.map(([name, state, mode]) => scenePackage(name, state, mode))),
  );
}

/** A width: integers (negative too), any double (NaN and infinities too), and the column boundaries. */
export const arbSceneWidth: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -10, max: 5000 }),
  fc.double({ noNaN: false }),
  fc.constantFrom(128, 129, 223, 224, 225, 415, 416, 1280),
);

/** Indexed read that fails loudly instead of using a non-null assertion. */
export function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`no element at ${String(index)}`);
  return value;
}

// ---- selection and overlay (task 6) ----

export interface ArbKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export const ARROW_KEY_NAMES = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;

/** Arrow and non-arrow keys with any modifier combination. */
export const arbKeyEvent: fc.Arbitrary<ArbKeyEvent> = fc.record({
  key: fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(...ARROW_KEY_NAMES) },
    { weight: 1, arbitrary: fc.constantFrom("Enter", " ", "Tab", "a", "Home") },
  ),
  ctrlKey: fc.boolean(),
  altKey: fc.boolean(),
  metaKey: fc.boolean(),
});

export const arbArrowKey: fc.Arbitrary<(typeof ARROW_KEY_NAMES)[number]> = fc.constantFrom(...ARROW_KEY_NAMES);

/** Package counts around the interesting boundaries, plus a generated count. */
export const arbGraveCount: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, 1, 60, 61, 300),
  fc.integer({ min: 0, max: 80 }),
);

// ---- drawer (task 7) ----

/** A valid response with at least one package, and the index of one package in it (document order). */
export const arbResponseAndPackage: fc.Arbitrary<{ response: ScanResponse; pkg: PackageHealth }> = arbScanResponse
  .filter((r) => r.report.packages.length > 0)
  .chain((response) =>
    fc.nat(response.report.packages.length - 1).map((i) => ({ response, pkg: at(response.report.packages, i) })),
  );

/** A copy of the package with all ten signals unavailable. */
export function allUnavailable(pkg: PackageHealth): PackageHealth {
  const copy = structuredClone(pkg) as unknown as { signals: Record<string, Json>; missingSignals: string[] };
  for (const n of SIGNAL_NAMES) {
    copy.signals[n] = { value: null, source: "https://registry.example/x", fetchedAt: "2026-11-12T00:00:00.000Z", available: false, reason: `why-${n}` };
  }
  copy.missingSignals = [...SIGNAL_NAMES];
  return copy as unknown as PackageHealth;
}

export interface ArbTrapRun {
  readonly count: number;
  readonly start: number;
  readonly presses: readonly boolean[]; // true is Shift+Tab
}

export const arbTrapRun: fc.Arbitrary<ArbTrapRun> = fc
  .integer({ min: 0, max: 20 })
  .chain((count) =>
    fc.record({
      count: fc.constant(count),
      start: fc.integer({ min: -1, max: Math.max(count - 1, -1) }),
      presses: fc.array(fc.boolean(), { maxLength: 60 }),
    }),
  );

// ---- header, hostile text and app (task 8) ----

/** A response whose scan metadata, when present, names sexton-demo/fixture in one run in five. */
export const arbHeaderResponse: fc.Arbitrary<{ response: ScanResponse; isDemo: boolean }> = fc
  .tuple(arbScanResponse, fc.integer({ min: 0, max: 4 }), fc.boolean(), fc.array(arbWord, { maxLength: 30 }))
  .map(([base, pick, isDemo, many]) => {
    const response = structuredClone(base) as unknown as { report: Json };
    const scan = response.report["scan"] as Json | undefined;
    if (scan !== undefined) {
      if (pick === 0) scan["repo"] = { owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" };
      if (pick === 1) scan["unlockedPackages"] = many;
    }
    return { response: response as unknown as ScanResponse, isDemo };
  });

const mapStrings = (list: unknown, f: (s: string) => string): unknown =>
  Array.isArray(list) ? list.map((x) => (typeof x === "string" ? f(x) : x)) : list;

/**
 * A deep copy with every free-text string passed through f. Names are mapped consistently, so links between
 * packages, policy failures and remediations hold. Numbers, dates, enums and booleans are untouched.
 */
export function mapFreeText(response: ScanResponse, f: (s: string) => string): ScanResponse {
  const copy = structuredClone(response) as unknown as Json;
  const report = copy["report"] as Json;
  const scan = report["scan"] as Json | undefined;
  if (scan !== undefined) {
    const repo = scan["repo"] as Json;
    repo["url"] = f(String(repo["url"]));
    scan["unlockedPackages"] = mapStrings(scan["unlockedPackages"], f);
  }
  for (const pkg of report["packages"] as Json[]) {
    pkg["name"] = f(String(pkg["name"]));
    pkg["installedVersion"] = f(String(pkg["installedVersion"]));
    pkg["stateReason"] = f(String(pkg["stateReason"]));
    for (const envelope of Object.values(pkg["signals"] as Json) as Json[]) {
      envelope["source"] = f(String(envelope["source"]));
      if (typeof envelope["reason"] === "string") envelope["reason"] = f(envelope["reason"]);
    }
    const signals = pkg["signals"] as Record<string, Json>;
    const advisories = signals["advisories"];
    if (advisories !== undefined && Array.isArray(advisories["value"])) {
      for (const a of advisories["value"] as Json[]) {
        a["id"] = f(String(a["id"]));
        a["summary"] = f(String(a["summary"]));
      }
    }
    const maintainers = signals["maintainers"];
    if (maintainers !== undefined) maintainers["value"] = mapStrings(maintainers["value"], f);
  }
  const policy = copy["policy"] as Json;
  for (const rule of policy["rules"] as Json[]) {
    for (const failure of rule["failures"] as Json[]) {
      failure["name"] = f(String(failure["name"]));
      failure["reason"] = f(String(failure["reason"]));
    }
  }
  const remediations = copy["remediations"];
  if (Array.isArray(remediations)) {
    for (const r of remediations as Json[]) {
      r["packageName"] = f(String(r["packageName"]));
      r["title"] = f(String(r["title"]));
      r["prBody"] = f(String(r["prBody"]));
    }
  }
  return copy as unknown as ScanResponse;
}

/** A valid response and a hostile prefix to put in front of every free-text string. */
export const arbHostilePair: fc.Arbitrary<{ response: ScanResponse; prefix: string }> = fc.record({
  response: arbScanResponse,
  prefix: arbHostile,
});
