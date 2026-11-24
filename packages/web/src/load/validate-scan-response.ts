import type { ScanResponse } from "@sexton/api";
import { REMEDIATION_KINDS, REMEDIATION_STATUSES, RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATES } from "./lists.js";

export const CONTRACT_ERROR_CODES = [
  "NOT_OBJECT",
  "MISSING_FIELD",
  "WRONG_TYPE",
  "UNKNOWN_VALUE",
  "INVALID_DATE",
  "DUPLICATE",
  "TOO_MANY_PACKAGES",
  "TOO_MANY_ITEMS",
] as const;
export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export interface ContractError {
  readonly path: string;
  readonly code: ContractErrorCode;
  readonly message: string;
}

export const CONTRACT_ERROR_TEXT: Record<ContractErrorCode, string> = {
  NOT_OBJECT: "expected an object",
  MISSING_FIELD: "required field is missing",
  WRONG_TYPE: "value has the wrong type",
  UNKNOWN_VALUE: "value is not an allowed value",
  INVALID_DATE: "value is not a parseable date",
  DUPLICATE: "value duplicates an earlier entry",
  TOO_MANY_PACKAGES: "more than 300 packages",
  TOO_MANY_ITEMS: "more than the allowed number of items",
};

export const MAX_PACKAGES = 300;
export const MAX_CONTRACT_ERRORS = 20;
/** Hard stop for work, not for the reported count. */
const COLLECT_LIMIT = 1000;

export type ValidationResult =
  | { readonly ok: true; readonly value: ScanResponse }
  | { readonly ok: false; readonly errors: readonly [ContractError, ...ContractError[]] };

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function has(o: Obj, key: string): boolean {
  return Object.hasOwn(o, key);
}

function dateParses(s: string): boolean {
  return Number.isFinite(Date.parse(s));
}

class Walk {
  readonly errors: ContractError[] = [];

  get full(): boolean {
    return this.errors.length >= COLLECT_LIMIT;
  }

  add(path: string, code: ContractErrorCode): void {
    if (this.full) return;
    this.errors.push({ path, code, message: CONTRACT_ERROR_TEXT[code] });
  }

  /** Reads an own field. Reports MISSING_FIELD and returns undefined when absent. */
  field(o: Obj, path: string, key: string): unknown {
    if (!has(o, key)) {
      this.add(`${path}/${key}`, "MISSING_FIELD");
      return undefined;
    }
    return o[key];
  }

  str(o: Obj, path: string, key: string, nonEmpty = false): string | undefined {
    const v = this.field(o, path, key);
    if (v === undefined && !has(o, key)) return undefined;
    if (typeof v !== "string" || (nonEmpty && v === "")) {
      this.add(`${path}/${key}`, "WRONG_TYPE");
      return undefined;
    }
    return v;
  }

  bool(o: Obj, path: string, key: string): boolean | undefined {
    const v = this.field(o, path, key);
    if (!has(o, key)) return undefined;
    if (typeof v !== "boolean") {
      this.add(`${path}/${key}`, "WRONG_TYPE");
      return undefined;
    }
    return v;
  }

  int(o: Obj, path: string, key: string, nonNegative: boolean): void {
    const v = this.field(o, path, key);
    if (!has(o, key)) return;
    if (typeof v !== "number" || !Number.isInteger(v) || (nonNegative && v < 0)) {
      this.add(`${path}/${key}`, "WRONG_TYPE");
    }
  }

  date(o: Obj, path: string, key: string): void {
    const v = this.field(o, path, key);
    if (!has(o, key)) return;
    if (typeof v !== "string") this.add(`${path}/${key}`, "WRONG_TYPE");
    else if (!dateParses(v)) this.add(`${path}/${key}`, "INVALID_DATE");
  }

  oneOf(o: Obj, path: string, key: string, list: readonly string[]): void {
    const v = this.field(o, path, key);
    if (!has(o, key)) return;
    this.checkEnum(v, `${path}/${key}`, list);
  }

  checkEnum(v: unknown, path: string, list: readonly string[]): void {
    if (typeof v !== "string") this.add(path, "WRONG_TYPE");
    else if (!list.includes(v)) this.add(path, "UNKNOWN_VALUE");
  }

  obj(o: Obj, path: string, key: string): Obj | undefined {
    const v = this.field(o, path, key);
    if (!has(o, key)) return undefined;
    if (!isObj(v)) {
      this.add(`${path}/${key}`, "NOT_OBJECT");
      return undefined;
    }
    return v;
  }

  arr(o: Obj, path: string, key: string): readonly unknown[] | undefined {
    const v = this.field(o, path, key);
    if (!has(o, key)) return undefined;
    if (!Array.isArray(v)) {
      this.add(`${path}/${key}`, "WRONG_TYPE");
      return undefined;
    }
    return v as readonly unknown[];
  }
}

function checkEnvelope(w: Walk, env: unknown, path: string, name: string): void {
  if (!isObj(env)) {
    w.add(path, "NOT_OBJECT");
    return;
  }
  const available = w.bool(env, path, "available");
  w.str(env, path, "source");
  w.date(env, path, "fetchedAt");
  if (available === false) {
    if (!has(env, "value")) w.add(`${path}/value`, "MISSING_FIELD");
    else if (env["value"] !== null) w.add(`${path}/value`, "WRONG_TYPE");
    w.str(env, path, "reason");
    return;
  }
  if (available !== true) return;
  if (!has(env, "value")) {
    w.add(`${path}/value`, "MISSING_FIELD");
    return;
  }
  const value = env["value"];
  if (name === "advisories") {
    if (!Array.isArray(value)) {
      w.add(`${path}/value`, "WRONG_TYPE");
      return;
    }
    const list = value as readonly unknown[];
    for (let k = 0; k < list.length && !w.full; k += 1) {
      const item = list[k];
      const p = `${path}/value/${k}`;
      if (!isObj(item)) {
        w.add(p, "NOT_OBJECT");
        continue;
      }
      w.str(item, p, "id");
      w.str(item, p, "summary");
      w.oneOf(item, p, "severity", SEVERITIES);
    }
  } else if (name === "transitiveReach") {
    if (!isObj(value)) {
      w.add(`${path}/value`, "NOT_OBJECT");
      return;
    }
    w.int(value, `${path}/value`, "reach", true);
  }
}

function checkPackage(w: Walk, pkg: unknown, path: string, names: Set<string>): void {
  if (!isObj(pkg)) {
    w.add(path, "NOT_OBJECT");
    return;
  }
  const name = w.str(pkg, path, "name", true);
  if (name !== undefined) {
    if (names.has(name)) w.add(`${path}/name`, "DUPLICATE");
    else names.add(name);
  }
  w.str(pkg, path, "installedVersion");
  w.oneOf(pkg, path, "state", STATES);
  w.str(pkg, path, "stateReason");
  const missing = w.arr(pkg, path, "missingSignals");
  if (missing !== undefined) {
    for (let j = 0; j < missing.length && !w.full; j += 1) {
      w.checkEnum(missing[j], `${path}/missingSignals/${j}`, SIGNAL_NAMES);
    }
  }
  const signals = w.obj(pkg, path, "signals");
  if (signals !== undefined) {
    for (const signalName of SIGNAL_NAMES) {
      const p = `${path}/signals/${signalName}`;
      if (!has(signals, signalName)) w.add(p, "MISSING_FIELD");
      else checkEnvelope(w, signals[signalName], p, signalName);
    }
  }
}

function checkReport(w: Walk, report: Obj): void {
  w.date(report, "/report", "generatedAt");
  const packages = w.arr(report, "/report", "packages");
  if (packages !== undefined) {
    if (packages.length > MAX_PACKAGES) {
      w.add("/report/packages", "TOO_MANY_PACKAGES");
    } else {
      const names = new Set<string>();
      for (let i = 0; i < packages.length && !w.full; i += 1) {
        checkPackage(w, packages[i], `/report/packages/${i}`, names);
      }
    }
  }
  if (has(report, "scan")) {
    const scan = report["scan"];
    if (!isObj(scan)) {
      w.add("/report/scan", "NOT_OBJECT");
    } else {
      const repo = w.obj(scan, "/report/scan", "repo");
      if (repo !== undefined) w.str(repo, "/report/scan/repo", "url");
      w.bool(scan, "/report/scan", "unlocked");
      const unlockedPackages = w.arr(scan, "/report/scan", "unlockedPackages");
      if (unlockedPackages !== undefined) {
        for (let i = 0; i < unlockedPackages.length && !w.full; i += 1) {
          if (typeof unlockedPackages[i] !== "string") w.add(`/report/scan/unlockedPackages/${i}`, "WRONG_TYPE");
        }
      }
      w.bool(scan, "/report/scan", "capped");
      w.int(scan, "/report/scan", "totalDirect", true);
    }
  }
}

function checkPolicy(w: Walk, policy: Obj): void {
  w.oneOf(policy, "/policy", "source", ["default", "file"]);
  w.bool(policy, "/policy", "pass");
  const rules = w.arr(policy, "/policy", "rules");
  if (rules === undefined) return;
  for (let i = 0; i < rules.length && !w.full; i += 1) {
    const rule = rules[i];
    const p = `/policy/rules/${i}`;
    if (!isObj(rule)) {
      w.add(p, "NOT_OBJECT");
      continue;
    }
    w.int(rule, p, "index", false);
    w.oneOf(rule, p, "type", RULE_TYPES);
    w.bool(rule, p, "pass");
    const failures = w.arr(rule, p, "failures");
    w.arr(rule, p, "unevaluated");
    w.arr(rule, p, "notFound");
    if (failures === undefined) continue;
    for (let j = 0; j < failures.length && !w.full; j += 1) {
      const failure = failures[j];
      const fp = `${p}/failures/${j}`;
      if (!isObj(failure)) {
        w.add(fp, "NOT_OBJECT");
        continue;
      }
      w.str(failure, fp, "name");
      w.str(failure, fp, "reason");
    }
  }
}

function checkRemediations(w: Walk, root: Obj): void {
  const list = w.arr(root, "", "remediations");
  if (list === undefined) return;
  const names = new Set<string>();
  for (let j = 0; j < list.length && !w.full; j += 1) {
    const entry = list[j];
    const p = `/remediations/${j}`;
    if (!isObj(entry)) {
      w.add(p, "NOT_OBJECT");
      continue;
    }
    const packageName = w.str(entry, p, "packageName");
    if (packageName !== undefined) {
      if (names.has(packageName)) w.add(`${p}/packageName`, "DUPLICATE");
      else names.add(packageName);
    }
    w.str(entry, p, "title");
    w.str(entry, p, "summary");
    w.str(entry, p, "prBody");
    w.oneOf(entry, p, "kind", REMEDIATION_KINDS);
    w.oneOf(entry, p, "status", REMEDIATION_STATUSES);
    if (has(entry, "chosenVersion")) w.str(entry, p, "chosenVersion");
    if (has(entry, "majorUpgrade")) w.bool(entry, p, "majorUpgrade");
    if (has(entry, "intent")) {
      const intent = w.obj(entry, p, "intent");
      if (intent !== undefined) {
        const ip = `${p}/intent`;
        w.str(intent, ip, "branch");
        w.str(intent, ip, "title");
        w.str(intent, ip, "body");
        w.str(intent, ip, "baseRef");
        w.arr(intent, ip, "files");
        // Spec migration-node-sass, Requirement 7.2.
        w.arr(intent, ip, "reviewComments");
      }
    }
  }
}

/** Spec remediate, Requirement 9.1: exactly { remediate: boolean }. An extra key is reported at /actions, never by name. */
function checkActions(w: Walk, root: Obj): void {
  const actions = w.obj(root, "", "actions");
  if (actions === undefined) return;
  w.bool(actions, "/actions", "remediate");
  if (Object.keys(actions).some((k) => k !== "remediate")) w.add("/actions", "UNKNOWN_VALUE");
}

const MAX_SEGMENTS = 64;
const MAX_REASON = 200;
const MAX_VERSION = 100;
const MAX_PULL_REQUESTS = 300;
const REPLAY_IDS: readonly string[] = ["axios", "keyv"];

/** A string field with a length cap. Absent is allowed when `optional`. Never echoes the value. */
function cappedStr(w: Walk, o: Obj, path: string, key: string, max: number, optional = false): void {
  if (optional && !has(o, key)) return;
  const v = w.str(o, path, key);
  if (v !== undefined && v.length > max) w.add(`${path}/${key}`, "WRONG_TYPE");
}

function checkSegments(w: Walk, tl: Obj, path: string): void {
  const segments = w.arr(tl, path, "segments");
  if (segments === undefined) return;
  if (segments.length < 1) w.add(`${path}/segments`, "MISSING_FIELD");
  if (segments.length > MAX_SEGMENTS) {
    w.add(`${path}/segments`, "TOO_MANY_ITEMS");
    return;
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < segments.length && !w.full; k += 1) {
    const seg = segments[k];
    const p = `${path}/segments/${k}`;
    if (!isObj(seg)) {
      w.add(p, "NOT_OBJECT");
      continue;
    }
    w.date(seg, p, "from");
    const from = typeof seg["from"] === "string" ? Date.parse(seg["from"]) : Number.NaN;
    if (Number.isFinite(from)) {
      if (from <= previous) w.add(`${p}/from`, "DUPLICATE");
      previous = from;
    }
    if (!has(seg, "state")) w.add(`${p}/state`, "MISSING_FIELD");
    else if (seg["state"] !== null) w.checkEnum(seg["state"], `${p}/state`, STATES);
    cappedStr(w, seg, p, "reason", MAX_REASON);
    w.bool(seg, p, "ghost");
    cappedStr(w, seg, p, "version", MAX_VERSION, true);
  }
}

/** Spec cemetery-time, 8.13 and 8.15. Keys are package names of the report. */
function checkTimelines(w: Walk, root: Obj, names: ReadonlySet<string>): void {
  const timelines = w.obj(root, "", "timelines");
  if (timelines === undefined) return;
  const keys = Object.keys(timelines);
  if (keys.length > MAX_PACKAGES) {
    w.add("/timelines", "TOO_MANY_PACKAGES");
    return;
  }
  keys.forEach((name, i) => {
    if (w.full) return;
    // The key itself never reaches the error path: the index does.
    const p = `/timelines/${i}`;
    if (!names.has(name)) w.add(p, "UNKNOWN_VALUE");
    const tl = Object.getOwnPropertyDescriptor(timelines, name)?.value as unknown;
    if (!isObj(tl)) {
      w.add(p, "NOT_OBJECT");
      return;
    }
    cappedStr(w, tl, p, "installed", MAX_VERSION);
    if (!has(tl, "coveredFrom")) w.add(`${p}/coveredFrom`, "MISSING_FIELD");
    else if (tl["coveredFrom"] !== null) w.date(tl, p, "coveredFrom");
    checkSegments(w, tl, p);
  });
}

function checkPullRequests(w: Walk, root: Obj, names: ReadonlySet<string>): void {
  const list = w.arr(root, "", "pullRequests");
  if (list === undefined) return;
  if (list.length > MAX_PULL_REQUESTS) {
    w.add("/pullRequests", "TOO_MANY_ITEMS");
    return;
  }
  const marked = new Set<string>();
  for (let j = 0; j < list.length && !w.full; j += 1) {
    const entry = list[j];
    const p = `/pullRequests/${j}`;
    if (!isObj(entry)) {
      w.add(p, "NOT_OBJECT");
      continue;
    }
    const pkg = w.str(entry, p, "package", true);
    if (pkg !== undefined) {
      if (!names.has(pkg)) w.add(`${p}/package`, "UNKNOWN_VALUE");
      else if (marked.has(pkg)) w.add(`${p}/package`, "DUPLICATE");
      else marked.add(pkg);
    }
    w.oneOf(entry, p, "kind", REMEDIATION_KINDS);
    const url = w.str(entry, p, "prUrl");
    if (url !== undefined && !url.startsWith("https://")) w.add(`${p}/prUrl`, "UNKNOWN_VALUE");
    w.date(entry, p, "timestamp");
  }
}

function checkReplay(w: Walk, root: Obj): void {
  const replay = w.obj(root, "", "replay");
  if (replay === undefined) return;
  w.oneOf(replay, "/replay", "id", REPLAY_IDS);
  cappedStr(w, replay, "/replay", "title", 120);
  cappedStr(w, replay, "/replay", "summary", 600);
  const sources = w.arr(replay, "/replay", "sources");
  if (sources === undefined) return;
  if (sources.length < 1) w.add("/replay/sources", "MISSING_FIELD");
  if (sources.length > 6) {
    w.add("/replay/sources", "TOO_MANY_ITEMS");
    return;
  }
  for (let k = 0; k < sources.length && !w.full; k += 1) {
    const src = sources[k];
    const p = `/replay/sources/${k}`;
    if (!isObj(src)) {
      w.add(p, "NOT_OBJECT");
      continue;
    }
    cappedStr(w, src, p, "label", 120);
    w.str(src, p, "url");
  }
}

function reportNames(input: Obj): Set<string> {
  const names = new Set<string>();
  const report = input["report"];
  const packages = isObj(report) ? report["packages"] : undefined;
  if (Array.isArray(packages)) {
    for (const pkg of packages as readonly unknown[]) {
      if (isObj(pkg) && typeof pkg["name"] === "string") names.add(pkg["name"]);
    }
  }
  return names;
}

/** Spec cemetery-time-fixes, 6.2, 6.3: exactly "too-large", and never together with timelines. The value is never echoed. */
function checkTimelinesOmitted(w: Walk, root: Obj): void {
  const value = Object.getOwnPropertyDescriptor(root, "timelinesOmitted")?.value as unknown;
  if (value !== "too-large" || has(root, "timelines")) w.add("/timelinesOmitted", "UNKNOWN_VALUE");
}

function compareErrors(a: ContractError, b: ContractError): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  return 0;
}

/** Pure, total and deterministic. No input string reaches an error (1.5 to 1.15). */
export function validateScanResponse(input: unknown): ValidationResult {
  const w = new Walk();
  if (!isObj(input)) {
    w.add("", "NOT_OBJECT");
  } else {
    const report = w.obj(input, "", "report");
    const policy = w.obj(input, "", "policy");
    if (report !== undefined) checkReport(w, report);
    if (policy !== undefined) checkPolicy(w, policy);
    if (has(input, "remediations")) checkRemediations(w, input);
    if (has(input, "actions")) checkActions(w, input);
    if (has(input, "timelines") || has(input, "pullRequests")) {
      const names = reportNames(input);
      if (has(input, "timelines")) checkTimelines(w, input, names);
      if (has(input, "pullRequests")) checkPullRequests(w, input, names);
    }
    if (has(input, "replay")) checkReplay(w, input);
    if (has(input, "timelinesOmitted")) checkTimelinesOmitted(w, input);
  }
  const [first, ...rest] = w.errors.slice().sort(compareErrors).slice(0, MAX_CONTRACT_ERRORS);
  if (first === undefined) return { ok: true, value: input as ScanResponse };
  return { ok: false, errors: [first, ...rest] };
}
