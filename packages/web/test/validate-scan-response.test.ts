import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_ERROR_TEXT,
  validateScanResponse,
  type ContractError,
} from "../src/load/validate-scan-response.js";
import { FAULT_MARKER, arbBigScanResponse, arbFault, arbJson, arbRemediations, arbScanResponse, cheapScan } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";
import { EXPECTED_SEGMENTS, readReplay } from "./support/replay-fixture.js";
import { formAt, timelineOf } from "../src/time/form-at.js";
import { stopsFor } from "../src/time/stops.js";
import type { ScanResponse } from "@sexton/api";

const PATH_RE = /^(\/(report|policy|remediations|packages|signals|[A-Za-z]+|\d+))*$/;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function errorsOf(input: unknown): readonly ContractError[] {
  const r = validateScanResponse(input);
  return r.ok ? [] : r.errors;
}

describe("validateScanResponse properties", () => {
  it(
    "Feature: cemetery-ui, Property 7: validateScanResponse accepts every valid response and rejects every faulty one",
    () => {
      fc.assert(
        fc.property(
          fc.oneof({ weight: 9, arbitrary: arbScanResponse }, { weight: 1, arbitrary: arbBigScanResponse }),
          (response) => {
            const result = validateScanResponse(response);
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value).toEqual(response);
            const again = validateScanResponse(JSON.parse(JSON.stringify(response)));
            expect(again.ok).toBe(true);
          },
        ),
        { numRuns: 1000 },
      );
      fc.assert(
        fc.property(arbFault, (fault) => {
          const result = validateScanResponse(fault.broken);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.errors.some((e) => e.path === fault.path)).toBe(true);
            for (const e of result.errors) {
              expect(e.path).not.toContain(FAULT_MARKER);
              expect(e.message).not.toContain(FAULT_MARKER);
            }
          }
        }),
        { numRuns: 1000 },
      );
    },
    120000,
  );

  it(
    "Feature: cemetery-ui, Property 10: The validator is total, pure and deterministic on arbitrary JSON",
    () => {
      fc.assert(
        fc.property(arbJson, (input) => {
          const before = structuredClone(input);
          deepFreeze(input);
          const first = validateScanResponse(input);
          const second = validateScanResponse(input);
          expect(input).toEqual(before);
          expect(second).toEqual(first);
          if (first.ok) {
            expect(first.value).toBe(input);
          } else {
            expect(first.errors.length).toBeGreaterThan(0);
            expect(first.errors.length).toBeLessThanOrEqual(20);
            for (let i = 0; i < first.errors.length; i += 1) {
              const e = first.errors[i] as ContractError;
              expect(e.path).toMatch(PATH_RE);
              expect(e.message).toBe(CONTRACT_ERROR_TEXT[e.code]);
              const prev = first.errors[i - 1];
              if (prev !== undefined) {
                const ordered = prev.path < e.path || (prev.path === e.path && prev.code <= e.code);
                expect(ordered).toBe(true);
              }
            }
          }
          // No input string reaches an error: plant a marker as a key and as values.
          const planted = validateScanResponse({ "@@m@@": "@@m@@", report: input, policy: "@@m@@", remediations: "@@m@@" });
          expect(JSON.stringify(planted)).not.toContain("@@m@@");
        }),
        { numRuns: 1000 },
      );
    },
    120000,
  );
});

describe("validateScanResponse examples", () => {
  const base = () => structuredClone(cheapScan(1)) as unknown as Record<string, Record<string, unknown>>;

  it("NOT_OBJECT", () => {
    expect(errorsOf(null)).toEqual([{ path: "", code: "NOT_OBJECT", message: CONTRACT_ERROR_TEXT.NOT_OBJECT }]);
    expect(errorsOf([]).map((e) => e.code)).toEqual(["NOT_OBJECT"]);
  });
  it("MISSING_FIELD", () => {
    expect(errorsOf({}).map((e) => `${e.path}:${e.code}`)).toEqual(["/policy:MISSING_FIELD", "/report:MISSING_FIELD"]);
  });
  it("WRONG_TYPE", () => {
    const v = base();
    (v["report"] as Record<string, unknown>)["generatedAt"] = 5;
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/generatedAt:WRONG_TYPE"]);
  });
  it("UNKNOWN_VALUE", () => {
    const v = base();
    (v["policy"] as Record<string, unknown>)["source"] = "other";
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/policy/source:UNKNOWN_VALUE"]);
  });
  it("INVALID_DATE", () => {
    const v = base();
    (v["report"] as Record<string, unknown>)["generatedAt"] = "not a date";
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/generatedAt:INVALID_DATE"]);
  });
  it("DUPLICATE", () => {
    const v = cheapScan(2) as unknown as { report: { packages: { name: string }[] } };
    (v.report.packages[1] as { name: string }).name = "pkg-0";
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/packages/1/name:DUPLICATE"]);
  });
  it("TOO_MANY_PACKAGES, with 300 accepted and 301 rejected", () => {
    expect(validateScanResponse(cheapScan(300)).ok).toBe(true);
    expect(errorsOf(cheapScan(301)).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/packages:TOO_MANY_PACKAGES"]);
  });
  it("report.scan absent and present", () => {
    const v = cheapScan(0) as unknown as { report: Record<string, unknown> };
    expect(validateScanResponse(v).ok).toBe(true);
    v.report["scan"] = { repo: { url: "u" }, unlocked: false, unlockedPackages: [], capped: false, totalDirect: 0 };
    expect(validateScanResponse(v).ok).toBe(true);
    v.report["scan"] = { repo: { url: "u" }, unlocked: false, unlockedPackages: [], capped: false, totalDirect: -1 };
    expect(errorsOf(v).map((e) => e.path)).toEqual(["/report/scan/totalDirect"]);
  });
  it("ignores unknown keys", () => {
    const v = { ...cheapScan(1), extra: { deep: [1] } };
    expect(validateScanResponse(v).ok).toBe(true);
  });
  it("caps errors at 20", () => {
    const v = cheapScan(30) as unknown as { report: { packages: Record<string, unknown>[] } };
    for (const p of v.report.packages) p["state"] = "x";
    expect(errorsOf(v)).toHaveLength(20);
  });
});

describe("validateScanResponse demo scan", () => {
  it("accepts the generated Demo scan", () => {
    const result = validateScanResponse(readDemoScan());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.report.packages).toHaveLength(12);
  });
});

describe("validateScanResponse remediations (spec remediation)", () => {
  const scan = cheapScan(3);
  const names = scan.report.packages.map((p) => p.name);
  type Entry = Record<string, unknown>;
  const FAULTS: readonly ((e: Entry, j: number) => string)[] = [
    (e, j) => (delete e["status"], `/remediations/${j}/status`),
    (e, j) => (delete e["summary"], `/remediations/${j}/summary`),
    (e, j) => (delete e["title"], `/remediations/${j}/title`),
    (e, j) => (delete e["prBody"], `/remediations/${j}/prBody`),
    (e, j) => ((e["status"] = FAULT_MARKER), `/remediations/${j}/status`),
    (e, j) => ((e["kind"] = FAULT_MARKER), `/remediations/${j}/kind`),
    (e, j) => ((e["summary"] = 7), `/remediations/${j}/summary`),
    (e, j) => ((e["chosenVersion"] = [FAULT_MARKER]), `/remediations/${j}/chosenVersion`),
    (e, j) => ((e["majorUpgrade"] = FAULT_MARKER), `/remediations/${j}/majorUpgrade`),
    (e, j) => ((e["intent"] = FAULT_MARKER), `/remediations/${j}/intent`),
    (e, j) => ((e["intent"] = { branch: 1, title: "t", body: "b", baseRef: "@default", files: [], reviewComments: [] }), `/remediations/${j}/intent/branch`),
    (e, j) => ((e["intent"] = { branch: "b", title: "t", body: "b", baseRef: "@default", files: FAULT_MARKER, reviewComments: [] }), `/remediations/${j}/intent/files`),
    (e, j) => ((e["intent"] = { branch: "b", title: "t", body: "b", baseRef: "@default", files: [] }), `/remediations/${j}/intent/reviewComments`),
  ];
  const arbFaulty = arbRemediations(names)
    .filter((list) => list.length > 0)
    .chain((list) => fc.tuple(fc.constant(list), fc.nat(list.length - 1), fc.nat(FAULTS.length - 1), fc.boolean()));

  it("Feature: remediation, Property 20: Web validator round trip and single faults", () => {
    fc.assert(
      fc.property(arbFaulty, ([list, j, f, duplicate]) => {
        const good = structuredClone({ ...scan, remediations: list });
        const ok = validateScanResponse(good);
        expect(ok.ok).toBe(true);
        if (ok.ok) expect(ok.value).toEqual(good);
        const broken = structuredClone(good) as unknown as { remediations: Entry[] };
        let path: string;
        if (duplicate && list.length > 1) {
          broken.remediations[1] = { ...(broken.remediations[1] as Entry), packageName: (broken.remediations[0] as Entry)["packageName"] };
          path = "/remediations/1/packageName";
        } else {
          path = (FAULTS[f] as (e: Entry, j: number) => string)(broken.remediations[j] as Entry, j);
        }
        const result = validateScanResponse(broken);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.some((e) => e.path === path)).toBe(true);
          expect(JSON.stringify(result.errors)).not.toContain(FAULT_MARKER);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("rejects the old placeholder shape and accepts a response with no remediations", () => {
    const old = { ...scan, remediations: [{ packageName: names[0], kind: "bump", title: "t", prBody: "b" }] };
    expect(errorsOf(old).map((e) => `${e.path}:${e.code}`)).toEqual(["/remediations/0/status:MISSING_FIELD", "/remediations/0/summary:MISSING_FIELD"]);
    const { remediations: _drop, ...none } = { ...scan, remediations: [] };
    expect(_drop).toEqual([]);
    expect(validateScanResponse(none).ok).toBe(true);
  });
});

// Spec cemetery-time, 8.13, 8.15, 14.3.
describe("timelines, pull requests and replay", () => {
  type Seg = { from: string; state: string | null; reason: string; ghost: boolean; version?: unknown };
  type Tl = { installed: string; coveredFrom: string | null; segments: Seg[] };
  const demo = readDemoScan() as { report: { packages: { name: string }[] }; timelines: Record<string, Tl> };
  const first = demo.report.packages[0]?.name ?? "";
  const base = (): Record<string, unknown> => structuredClone(demo) as unknown as Record<string, unknown>;
  const withTimeline = (edit: (tl: Tl) => void): unknown => {
    const body = base() as { timelines: Record<string, Tl> };
    edit(body.timelines[first] as Tl);
    return body;
  };
  const paths = (input: unknown): string[] => errorsOf(input).map((e) => e.path);
  const iso = (i: number): string => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString();

  it("Feature: cemetery-time, Property 12: Built timelines respect the size cap and the contract (validator half)", () => {
    expect(validateScanResponse(JSON.parse(JSON.stringify(demo))).ok).toBe(true);
    const { timelines: _t, ...without } = demo;
    expect(_t).toBeDefined();
    expect(validateScanResponse(without).ok).toBe(true);
  });

  it("Feature: cemetery-time, Property 14: The validator rejects bad timelines, pull requests and replay blocks", () => {
    const states = fc.constantFrom("Possessed", "Dead", "Haunted", "Restless", "Alive", null);
    const arbSegments = fc.array(fc.record({ state: states, ghost: fc.boolean(), reason: fc.string({ maxLength: 200 }), version: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }) }), {
      minLength: 1,
      maxLength: 64,
    });
    const build = (segs: { state: string | null; ghost: boolean; reason: string; version: string | undefined }[]): Seg[] =>
      segs.map((s, i) => ({ from: iso(i), state: s.state, ghost: s.ghost, reason: s.reason, ...(s.version !== undefined ? { version: s.version } : {}) }));
    fc.assert(
      fc.property(arbSegments, (segs) => {
        // Valid, with and without a version, and after a JSON round trip.
        const ok = withTimeline((tl) => (tl.segments = build(segs)));
        expect(validateScanResponse(JSON.parse(JSON.stringify(ok))).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
    const fault = fc.constantFrom(
      "version-101",
      "version-number",
      "reason-201",
      "state-bad",
      "ghost-string",
      "from-bad",
      "from-not-increasing",
      "from-duplicate",
      "empty",
      "too-many",
      "installed-101",
      "covered-bad",
      "unknown-package",
    );
    fc.assert(
      fc.property(arbSegments, fault, (segs, f) => {
        const body = base() as { timelines: Record<string, Tl> };
        const tl = body.timelines[first] as Tl;
        tl.segments = build(segs);
        let path = `/timelines/0/segments/0`;
        const seg0 = tl.segments[0] as Seg;
        switch (f) {
          case "version-101": seg0.version = "v".repeat(101); path += "/version"; break;
          case "version-number": seg0.version = 3; path += "/version"; break;
          case "reason-201": seg0.reason = "r".repeat(201); path += "/reason"; break;
          case "state-bad": seg0.state = "Zombie"; path += "/state"; break;
          case "ghost-string": (seg0 as { ghost: unknown }).ghost = "yes"; path += "/ghost"; break;
          case "from-bad": seg0.from = "not a date"; path += "/from"; break;
          case "from-not-increasing":
          case "from-duplicate":
            tl.segments = [seg0, { ...seg0, from: f === "from-duplicate" ? seg0.from : iso(-5) }];
            path = `/timelines/0/segments/1/from`;
            break;
          case "empty": tl.segments = []; path = "/timelines/0/segments"; break;
          case "too-many": tl.segments = Array.from({ length: 65 }, (_, i) => ({ ...seg0, from: iso(i) })); path = "/timelines/0/segments"; break;
          case "installed-101": tl.installed = "i".repeat(101); path = "/timelines/0/installed"; break;
          case "covered-bad": tl.coveredFrom = "nope"; path = "/timelines/0/coveredFrom"; break;
          default: {
            const t = body.timelines;
            body.timelines = { ["not-in-report-" + FAULT_MARKER]: tl, ...Object.fromEntries(Object.entries(t).filter(([k]) => k !== first)) };
            path = "/timelines/0";
          }
        }
        const result = validateScanResponse(body);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.some((e) => e.path === path)).toBe(true);
          expect(JSON.stringify(result.errors)).not.toContain(FAULT_MARKER);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("accepts a Segment version of exactly 100 characters and rejects 101 and non-strings", () => {
    expect(validateScanResponse(withTimeline((tl) => ((tl.segments[0] as Seg).version = "v".repeat(100)))).ok).toBe(true);
    expect(paths(withTimeline((tl) => ((tl.segments[0] as Seg).version = "v".repeat(101))))).toEqual([`/timelines/0/segments/0/version`]);
    for (const bad of [null, 1, true, {}, []]) {
      expect(paths(withTimeline((tl) => ((tl.segments[0] as Seg).version = bad)))).toEqual([`/timelines/0/segments/0/version`]);
    }
  });

  it("does not let a __proto__ key pollute or throw", () => {
    const text = JSON.stringify(base()).replace('"timelines":{', '"timelines":{"__proto__":{"installed":"1","coveredFrom":null,"segments":[]},');
    const result = validateScanResponse(JSON.parse(text));
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>)["installed"]).toBeUndefined();
  });

  it("checks pullRequests", () => {
    const entry = { package: first, kind: "bump", prUrl: "https://github.com/a/b/pull/1", timestamp: "2026-11-20T00:00:00Z" };
    expect(validateScanResponse({ ...base(), pullRequests: [entry] }).ok).toBe(true);
    expect(paths({ ...base(), pullRequests: [entry, { ...entry, kind: "remove" }] })).toEqual(["/pullRequests/1/package"]);
    expect(paths({ ...base(), pullRequests: [{ ...entry, package: "nope" }] })).toEqual(["/pullRequests/0/package"]);
    expect(paths({ ...base(), pullRequests: [{ ...entry, kind: "zap" }] })).toEqual(["/pullRequests/0/kind"]);
    expect(paths({ ...base(), pullRequests: [{ ...entry, prUrl: "http://x" }] })).toEqual(["/pullRequests/0/prUrl"]);
    expect(paths({ ...base(), pullRequests: [{ ...entry, timestamp: "x" }] })).toEqual(["/pullRequests/0/timestamp"]);
    expect(errorsOf({ ...base(), pullRequests: Array.from({ length: 301 }, () => entry) }).map((e) => e.code)).toEqual(["TOO_MANY_ITEMS"]);
  });

  it("checks replay", () => {
    // A replay's base is a replay file: the demo has more Stops than a Replay may have Steps.
    const base = (): Record<string, unknown> => structuredClone(readReplay("axios")) as Record<string, unknown>;
    const steps = (readReplay("axios") as ScanResponse).replay?.steps ?? [];
    const replay = { id: "axios", title: "t", summary: "s", sources: [{ label: "l", url: "http://not-https.example" }], steps, why: "w" };
    expect(validateScanResponse({ ...base(), replay }).ok).toBe(true);
    expect(paths({ ...base(), replay: { ...replay, id: "other" } })).toEqual(["/replay/id"]);
    expect(paths({ ...base(), replay: { ...replay, title: "t".repeat(121) } })).toEqual(["/replay/title"]);
    expect(paths({ ...base(), replay: { ...replay, summary: "s".repeat(601) } })).toEqual(["/replay/summary"]);
    expect(paths({ ...base(), replay: { ...replay, sources: [] } })).toEqual(["/replay/sources"]);
    expect(errorsOf({ ...base(), replay: { ...replay, sources: Array.from({ length: 7 }, () => replay.sources[0]) } }).map((e) => e.code)).toEqual(["TOO_MANY_ITEMS"]);
    expect(paths({ ...base(), replay: { ...replay, sources: [{ label: "l".repeat(121), url: "u" }] } })).toEqual(["/replay/sources/0/label"]);
  });

  // Spec clean-site, 8.13 and 8.15.
  it("checks the Step texts, the why text and the Step count against stopsFor", () => {
    const base = (): Record<string, unknown> => structuredClone(readReplay("axios")) as Record<string, unknown>;
    const stops = stopsFor(readReplay("axios") as ScanResponse).stops.length;
    expect(stops).toBe(3);
    const step = (i: number): Record<string, string> => ({ title: `t${String(i)}`, happened: `h${String(i)}`, shows: `s${String(i)}` });
    const steps = Array.from({ length: stops }, (_, i) => step(i));
    const replay = { id: "axios", title: "t", summary: "s", sources: [{ label: "l", url: "https://x.example" }], steps, why: "w" };
    const codes = (input: unknown): string[] => errorsOf(input).map((e) => `${e.path}:${e.code}`);
    expect(validateScanResponse({ ...base(), replay }).ok).toBe(true);
    expect(codes({ ...base(), replay: { ...replay, steps: steps.slice(1) } })).toEqual(["/replay/steps:MISSING_FIELD"]);
    expect(codes({ ...base(), replay: { ...replay, steps: [...steps, step(99)] } })).toEqual(["/replay/steps:TOO_MANY_ITEMS"]);
    expect(codes({ ...base(), replay: { ...replay, steps: [] } })).toEqual(["/replay/steps:MISSING_FIELD"]);
    for (const field of ["title", "happened", "shows"]) {
      const same = steps.map((s, i) => (i === 1 ? { ...s, [field]: steps[0]?.[field] ?? "" } : s));
      expect(codes({ ...base(), replay: { ...replay, steps: same } })).toEqual([`/replay/steps/1/${field}:DUPLICATE`]);
      const empty = steps.map((s, i) => (i === 0 ? { ...s, [field]: "" } : s));
      expect(codes({ ...base(), replay: { ...replay, steps: empty } })).toEqual([`/replay/steps/0/${field}:WRONG_TYPE`]);
      const { [field]: _gone, ...rest } = steps[0] ?? {};
      expect(_gone).toBeDefined();
      expect(codes({ ...base(), replay: { ...replay, steps: [rest, ...steps.slice(1)] } })).toEqual([`/replay/steps/0/${field}:MISSING_FIELD`]);
    }
    expect(codes({ ...base(), replay: { ...replay, steps: steps.map((s, i) => (i === 0 ? { ...s, title: "t".repeat(81) } : s)) } })).toEqual(["/replay/steps/0/title:WRONG_TYPE"]);
    expect(codes({ ...base(), replay: { ...replay, steps: steps.map((s, i) => (i === 0 ? { ...s, shows: "s".repeat(401) } : s)) } })).toEqual(["/replay/steps/0/shows:WRONG_TYPE"]);
    expect(codes({ ...base(), replay: { ...replay, steps: [7, ...steps.slice(1)] } })).toEqual(["/replay/steps/0:NOT_OBJECT"]);
    expect(codes({ ...base(), replay: { ...replay, steps: Array.from({ length: 9 }, (_, i) => step(i)) } })).toEqual(["/replay/steps:TOO_MANY_ITEMS"]);
    // The demo's Stops are more than a Replay may hold, so a replay block on it is refused.
    expect(validateScanResponse({ ...structuredClone(demo), replay }).ok).toBe(false);
    expect(codes({ ...base(), replay: { ...replay, why: "w".repeat(801) } })).toEqual(["/replay/why:WRONG_TYPE"]);
    expect(codes({ ...base(), replay: { ...replay, why: "" } })).toEqual(["/replay/why:WRONG_TYPE"]);
    const { why: _w, ...noWhy } = replay;
    expect(_w).toBe("w");
    expect(codes({ ...base(), replay: noWhy })).toEqual(["/replay/why:MISSING_FIELD"]);
    // A shipped replay file with one Step too few or too many is refused.
    for (const id of ["axios", "keyv"] as const) {
      const doc = structuredClone(readReplay(id)) as { replay: { steps: unknown[] } };
      expect(validateScanResponse(doc).ok).toBe(true);
      doc.replay.steps.pop();
      expect(validateScanResponse(doc).ok).toBe(false);
    }
  });
});

describe("Property 20: The replay fixtures pass the validator, also under mutation, and follow the sourced versions", () => {
  const ids = ["axios", "keyv"] as const;
  type Obj = Record<string, unknown>;
  const tlOf = (r: Obj, id: string): Obj => (r["timelines"] as Obj)[id] as Obj;
  const firstSegment = (r: Obj, id: string): Obj => (tlOf(r, id)["segments"] as Obj[])[0] as Obj;
  const mutations: readonly ((r: Obj, id: string) => void)[] = [
    (r) => {
      delete (r["report"] as Obj)["scan"];
    },
    (r) => {
      delete r["remediations"];
    },
    (r) => {
      delete r["actions"];
    },
    (r) => {
      r["actions"] = null;
    },
    (r, id) => {
      tlOf(r, id)["coveredFrom"] = null;
    },
    (r, id) => {
      delete firstSegment(r, id)["reason"];
    },
    (r, id) => {
      delete firstSegment(r, id)["version"];
    },
    (r, id) => {
      firstSegment(r, id)["version"] = null;
    },
  ];
  it("Feature: cemetery-time, Property 20: The replay fixtures pass the validator, also under mutation, and follow the sourced versions", () => {
    for (const id of ids) {
      expect(validateScanResponse(readReplay(id)).ok).toBe(true);
      const response = readReplay(id) as ScanResponse;
      const segments = response.timelines?.[id]?.segments ?? [];
      expect(segments.map((s) => ({ from: s.from, version: s.version }))).toEqual(EXPECTED_SEGMENTS[id].map((s) => ({ from: s.from, version: s.version })));
      expect(segments.map((s) => ({ state: s.state, reason: s.reason }))).toEqual(EXPECTED_SEGMENTS[id].map((s) => ({ state: s.state, reason: s.reason })));
      for (const s of segments) expect(s.version).not.toBe("6.0.0-rc.1");
      expect(segments.every((s) => !s.ghost)).toBe(true);
      expect(stopsFor(response).stops.map((ms) => new Date(ms).toISOString())).toEqual(segments.map((s) => s.from));
      const last = segments[segments.length - 1];
      expect(response.report.packages[0]?.state).toBe(last?.state);
      expect(response.report.packages[0]?.installedVersion).toBe(last?.version);
      expect(response.timelines?.[id]?.installed).toBe(last?.version);
    }
    fc.assert(
      fc.property(fc.constantFrom(...ids), fc.subarray([...mutations.keys()]), (id, picked) => {
        const doc = JSON.parse(JSON.stringify(readReplay(id))) as Obj;
        for (const k of picked) (mutations[k] as (r: Obj, i: string) => void)(doc, id);
        let outcome: ReturnType<typeof validateScanResponse> | undefined;
        expect(() => {
          outcome = validateScanResponse(doc);
        }).not.toThrow();
        expect(outcome).toBeDefined();
      }),
      { numRuns: 100 },
    );
    // Lookup: every instant from the first from to the scan date gives the version and state of the holding Segment.
    for (const id of ids) {
      const response = readReplay(id) as ScanResponse;
      const timeline = timelineOf(response, id);
      const expected = EXPECTED_SEGMENTS[id];
      const startMs = Date.parse(expected[0].from);
      const endMs = Date.parse(response.report.generatedAt);
      const pkg = response.report.packages[0];
      fc.assert(
        fc.property(fc.integer({ min: startMs, max: endMs }), (t) => {
          const holder = [...expected].reverse().find((s) => Date.parse(s.from) <= t);
          const view = formAt(timeline, t, { state: pkg?.state ?? null, reason: pkg?.stateReason ?? "", ghost: false });
          expect(view.version).toBe(holder?.version);
          expect(view.state).toBe(holder?.state);
          expect(view.reason).toBe(holder?.reason);
        }),
        { numRuns: 100 },
      );
    }
  });
});

// Spec cemetery-time-fixes, task 4.5.
describe("Property 2: The validator accepts the omitted reason only as \"too-large\" and never with timelines", () => {
  it("Feature: cemetery-time-fixes, Property 2: The validator accepts the omitted reason only as \"too-large\" and never with timelines", () => {
    const arbValue: fc.Arbitrary<unknown> = fc.oneof(
      fc.constant("too-large"),
      fc.constantFrom("TOO-LARGE", "Too-Large", " too-large", "too-large ", "too_large", "too-large\n", ""),
      fc.string({ maxLength: 20 }),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.string({ maxLength: 5 }), { maxLength: 3 }),
      fc.dictionary(fc.string({ maxLength: 5 }), fc.string({ maxLength: 5 }), { maxKeys: 2 }),
    );
    const base = readDemoScan() as Record<string, unknown>;
    const noTimelines: Record<string, unknown> = { ...base };
    Reflect.deleteProperty(noTimelines, "timelines");
    fc.assert(
      fc.property(arbValue, fc.boolean(), (v, withTimelines) => {
        const body = withTimelines ? { ...base, timelinesOmitted: v } : { ...noTimelines, timelinesOmitted: v };
        const result = validateScanResponse(body);
        const valid = v === "too-large" && !withTimelines;
        expect(result.ok).toBe(valid);
        if (!result.ok) {
          expect(result.errors).toEqual([{ path: "/timelinesOmitted", code: "UNKNOWN_VALUE", message: expect.any(String) as string }]);
          if (typeof v === "string" && v.length >= 4) for (const e of result.errors) expect(e.message).not.toContain(v);
        }
      }),
      { numRuns: 100 },
    );
    // Without the key the result is unchanged.
    expect(validateScanResponse(base).ok).toBe(true);
    expect(validateScanResponse(noTimelines).ok).toBe(true);
  });
});
