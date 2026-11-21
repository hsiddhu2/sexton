import type { ScanResponse } from "@sexton/api";
import { REMEDIATION_KINDS, RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATES } from "./lists.js";

export const CONTRACT_ERROR_CODES = [
  "NOT_OBJECT",
  "MISSING_FIELD",
  "WRONG_TYPE",
  "UNKNOWN_VALUE",
  "INVALID_DATE",
  "DUPLICATE",
  "TOO_MANY_PACKAGES",
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
    w.str(entry, p, "prBody");
    w.oneOf(entry, p, "kind", REMEDIATION_KINDS);
  }
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
  }
  const [first, ...rest] = w.errors.slice().sort(compareErrors).slice(0, MAX_CONTRACT_ERRORS);
  if (first === undefined) return { ok: true, value: input as ScanResponse };
  return { ok: false, errors: [first, ...rest] };
}
