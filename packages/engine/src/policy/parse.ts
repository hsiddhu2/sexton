// Policy parser and validator. Spec: .kiro/specs/policy, Requirement 2. Pure, total: never throws.
// Ajv message text never reaches a ValidationError. The mapper writes every message from the code and path.

import type { ErrorObject } from "ajv/dist/2020.js";
import { isMap, isScalar, isSeq, parseAllDocuments, type Document } from "yaml";
import {
  STATE_ORDER,
  type ErrorCode,
  type ForbidInstallScriptsRule,
  type ParseResult,
  type Policy,
  type Rule,
  type State,
  type ValidationError,
} from "../types.js";
import { isValidGlob } from "./glob.js";
import { validatePolicySchema } from "./schema.js";

const PACKAGES_PATH = /^\/rules\/\d+\/packages(\/|$)/;
const PATTERNS_PATH = /^\/rules\/\d+\/matchPackagePatterns(\/|$)/;
const MONTHS_PATH = /^\/rules\/\d+\/months$/;
const RULE_TYPE_PATH = /^\/rules\/\d+\/type$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Reads a value by JSON Pointer. Own properties only. Returns undefined when absent. */
function getAt(root: unknown, pointer: string): unknown {
  let current: unknown = root;
  if (pointer === "") {
    return current;
  }
  for (const raw of pointer.split("/").slice(1)) {
    const key = unescapePointer(raw);
    if (Array.isArray(current)) {
      const index = Number(key);
      current = Number.isInteger(index) ? (current as readonly unknown[])[index] : undefined;
    } else if (isRecord(current) && Object.hasOwn(current, key)) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function messageFor(code: ErrorCode, path: string): string {
  const where = path === "" ? "the document" : path === "$" ? "the text" : path;
  switch (code) {
    case "YAML_SYNTAX":
      return "the text is not valid YAML";
    case "MULTIPLE_DOCUMENTS":
      return "the text holds more than one YAML document";
    case "DUPLICATE_KEY":
      return `${where} holds the same key twice`;
    case "NOT_OBJECT":
      return "the document must be a mapping";
    case "MISSING_FIELD":
      return `${where} is required`;
    case "VERSION_UNSUPPORTED":
      return `${where} must be the integer 1`;
    case "UNKNOWN_RULE_TYPE":
      return `${where} is not a known rule type`;
    case "UNKNOWN_FIELD":
      return `${where} is not allowed here`;
    case "WRONG_TYPE":
      return `${where} has the wrong type or an invalid value`;
    case "EMPTY_LIST":
      return `${where} must not be empty`;
    case "INVALID_MONTHS":
      return `${where} must be a positive integer`;
    case "INVALID_WILDCARD":
      return `${where} may hold "*" only as its single entry`;
    case "INVALID_PATTERN":
      return `${where} is not a valid pattern`;
  }
}

function makeError(code: ErrorCode, path: string): ValidationError {
  return { path, message: messageFor(code, path), code };
}

function failWith(errors: readonly ValidationError[]): ParseResult {
  const sorted = dedupeAndSort(errors);
  const [first, ...rest] = sorted;
  if (first === undefined) {
    return { ok: false, errors: [makeError("YAML_SYNTAX", "$")] };
  }
  return { ok: false, errors: [first, ...rest] };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function dedupeAndSort(errors: readonly ValidationError[]): ValidationError[] {
  const seen = new Set<string>();
  const unique: ValidationError[] = [];
  for (const error of errors) {
    const key = JSON.stringify([error.path, error.code, error.message]);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(error);
    }
  }
  return unique.sort(
    (a, b) => compareStrings(a.path, b.path) || compareStrings(a.code, b.code) || compareStrings(a.message, b.message),
  );
}

/** Walks the YAML AST and collects the path of every mapping that holds a repeated scalar key. */
function collectDuplicatePaths(node: unknown, path: string, out: string[]): void {
  if (isMap(node)) {
    const seen = new Set<string>();
    let repeated = false;
    for (const pair of node.items) {
      const key: unknown = pair.key;
      let childPath = `${path}/?`;
      if (isScalar(key)) {
        const value: unknown = key.value;
        const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
        const id = `${typeof value}:${text}`;
        if (seen.has(id)) {
          repeated = true;
        }
        seen.add(id);
        childPath = `${path}/${escapePointer(text)}`;
      }
      collectDuplicatePaths(pair.value, childPath, out);
    }
    if (repeated) {
      out.push(path);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => {
      collectDuplicatePaths(item, `${path}/${String(index)}`, out);
    });
  }
}

function paramString(error: ErrorObject, name: string): string {
  const params = error.params as Record<string, unknown>;
  const value = params[name];
  return typeof value === "string" ? value : "";
}

/** Maps one Ajv error to a ValidationError, or null when the error is dropped. */
function mapAjvError(error: ErrorObject, root: unknown): ValidationError | null {
  const at = error.instancePath;
  switch (error.keyword) {
    case "if":
      return null;
    case "required":
      return makeError("MISSING_FIELD", `${at}/${escapePointer(paramString(error, "missingProperty"))}`);
    case "additionalProperties":
      return makeError("UNKNOWN_FIELD", `${at}/${escapePointer(paramString(error, "additionalProperty"))}`);
    case "false schema":
      return makeError("UNKNOWN_FIELD", at);
    case "oneOf":
    case "const":
    case "not":
      if (PACKAGES_PATH.test(at)) {
        return null;
      }
      if (error.keyword === "const" && at === "/version") {
        return makeError(Number.isInteger(getAt(root, at)) ? "VERSION_UNSUPPORTED" : "WRONG_TYPE", at);
      }
      return makeError("WRONG_TYPE", at);
    case "enum":
      return makeError(RULE_TYPE_PATH.test(at) ? "UNKNOWN_RULE_TYPE" : "WRONG_TYPE", at);
    case "minItems":
      return makeError("EMPTY_LIST", at);
    case "minimum":
      return makeError(MONTHS_PATH.test(at) ? "INVALID_MONTHS" : "WRONG_TYPE", at);
    case "pattern":
    case "minLength":
      return PATTERNS_PATH.test(at) ? null : makeError("WRONG_TYPE", at);
    case "type":
      if (MONTHS_PATH.test(at) && typeof getAt(root, at) === "number") {
        return makeError("INVALID_MONTHS", at);
      }
      return makeError("WRONG_TYPE", at);
    default:
      return makeError("WRONG_TYPE", at);
  }
}

/** The Engine checks that are the only source of INVALID_PATTERN and INVALID_WILDCARD. */
function engineChecks(value: unknown): ValidationError[] {
  const out: ValidationError[] = [];
  if (!isRecord(value) || !Array.isArray(value["rules"])) {
    return out;
  }
  (value["rules"] as readonly unknown[]).forEach((rule, i) => {
    if (!isRecord(rule)) {
      return;
    }
    const patterns = rule["matchPackagePatterns"];
    if (Array.isArray(patterns)) {
      (patterns as readonly unknown[]).forEach((pattern, j) => {
        if (typeof pattern === "string" && !isValidGlob(pattern)) {
          out.push(makeError("INVALID_PATTERN", `/rules/${String(i)}/matchPackagePatterns/${String(j)}`));
        }
      });
    }
    const packages = rule["packages"];
    if (rule["type"] === "require_provenance" && Array.isArray(packages)) {
      const list = packages as readonly unknown[];
      if (list.length > 1 && list.includes("*")) {
        out.push(makeError("INVALID_WILDCARD", `/rules/${String(i)}/packages`));
      }
    }
  });
  return out;
}

function stringList(value: unknown): string[] {
  return (Array.isArray(value) ? (value as readonly unknown[]) : []).map((entry) => (typeof entry === "string" ? entry : ""));
}

function stateList(value: unknown): State[] {
  const out: State[] = [];
  for (const entry of Array.isArray(value) ? (value as readonly unknown[]) : []) {
    const state = STATE_ORDER.find((s) => s === entry);
    if (state !== undefined) {
      out.push(state);
    }
  }
  return out;
}

/** Copies only schema keys into fresh plain objects. Optional keys appear only when present. */
function buildRule(raw: Record<string, unknown>): Rule {
  const name = raw["name"];
  const shared = {
    ...(typeof name === "string" ? { name } : {}),
    ...(raw["matchPackageNames"] !== undefined ? { matchPackageNames: stringList(raw["matchPackageNames"]) } : {}),
    ...(raw["matchPackagePatterns"] !== undefined ? { matchPackagePatterns: stringList(raw["matchPackagePatterns"]) } : {}),
    ...(raw["excludePackageNames"] !== undefined ? { excludePackageNames: stringList(raw["excludePackageNames"]) } : {}),
  };
  switch (raw["type"]) {
    case "forbid_state":
      return { type: "forbid_state", states: stateList(raw["states"]), ...shared };
    case "forbid_install_scripts": {
      const allow: Pick<ForbidInstallScriptsRule, "allow"> = raw["allow"] !== undefined ? { allow: stringList(raw["allow"]) } : {};
      return { type: "forbid_install_scripts", ...allow, ...shared };
    }
    case "max_age_months":
      return { type: "max_age_months", months: Number(raw["months"]), ...shared };
    case "require_provenance":
      return { type: "require_provenance", packages: stringList(raw["packages"]), ...shared };
    default:
      throw new Error("unreachable: rule type was validated");
  }
}

function buildPolicy(value: Record<string, unknown>): Policy {
  const rules = (Array.isArray(value["rules"]) ? (value["rules"] as readonly unknown[]) : []).map((rule) => {
    if (!isRecord(rule)) {
      throw new Error("unreachable: rule was validated");
    }
    return buildRule(rule);
  });
  return { version: 1, rules };
}

function parseDocuments(text: string): ParseResult {
  const documents: Document[] = Array.from(parseAllDocuments(text, { uniqueKeys: true }) as Iterable<Document>);

  for (const document of documents) {
    const syntax = document.errors.find((e) => e.code !== "DUPLICATE_KEY");
    if (syntax !== undefined) {
      const line = syntax.linePos?.[0].line;
      return failWith([
        {
          path: "$",
          code: "YAML_SYNTAX",
          message: `the text is not valid YAML (${syntax.code}${line === undefined ? "" : ` at line ${String(line)}`})`,
        },
      ]);
    }
  }
  if (documents.length > 1) {
    return failWith([makeError("MULTIPLE_DOCUMENTS", "$")]);
  }
  const document = documents[0];
  if (document === undefined) {
    return failWith([makeError("NOT_OBJECT", "")]);
  }
  if (document.errors.length > 0) {
    const paths: string[] = [];
    collectDuplicatePaths(document.contents, "", paths);
    if (paths.length === 0) {
      paths.push("");
    }
    return failWith(paths.map((path) => makeError("DUPLICATE_KEY", path)));
  }

  const value: unknown = document.toJS({ maxAliasCount: 100 });
  if (!isRecord(value)) {
    return failWith([makeError("NOT_OBJECT", "")]);
  }

  const schemaValid = validatePolicySchema(value);
  const mapped: ValidationError[] = [];
  for (const error of validatePolicySchema.errors ?? []) {
    const result = mapAjvError(error, value);
    if (result !== null) {
      mapped.push(result);
    }
  }
  const errors = [...mapped, ...engineChecks(value)];
  if (errors.length > 0) {
    return failWith(errors);
  }
  if (!schemaValid) {
    // Fail closed: the validator rejected the document but no error survived mapping. Requirement 2.26.
    return { ok: false, errors: [{ path: "", code: "WRONG_TYPE", message: "policy rejected by schema validation" }] };
  }
  return { ok: true, policy: buildPolicy(value) };
}

/** Parses and validates a policy document. Never throws. Requirement 2.2. */
export function parsePolicy(text: string): ParseResult {
  try {
    return parseDocuments(text);
  } catch {
    return failWith([{ path: "$", code: "YAML_SYNTAX", message: "the text could not be parsed" }]);
  }
}
