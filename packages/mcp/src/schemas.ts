// Tool input schemas, written by hand as Standard Schema objects. Spec: .kiro/specs/sexton-power, Requirements 2.1, 2.3, 4.6, 12.6.
// They check type and shape only. The bounds on projectDir are in project-dir.ts.
export const MAX_PROJECT_DIR_CHARS = 4096;
export const MAX_PACKAGE_NAME_CHARS = 214;

interface Issue {
  readonly message: string;
}
export type Validated<T> = { readonly value: T } | { readonly issues: readonly Issue[] };

export interface ProjectArguments {
  readonly projectDir: string;
}
export interface PackageArguments extends ProjectArguments {
  readonly package: string;
}

export interface JsonSchemaStandard<T> {
  /** The strict check of Requirement 2.3. The SDK is given a pass-through validate so that a bad call becomes our Error result, not the SDK's text. */
  readonly parse: (value: unknown) => Validated<T>;
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "sexton";
    readonly validate: (value: unknown) => Validated<T>;
    readonly jsonSchema: {
      readonly input: (options: unknown) => Record<string, unknown>;
      readonly output: (options: unknown) => Record<string, unknown>;
    };
  };
}

const PROJECT_DIR_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: MAX_PROJECT_DIR_CHARS,
  description: "Absolute path of the project directory: the workspace root.",
} as const;
const PACKAGE_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: MAX_PACKAGE_NAME_CHARS,
  description: "Name of a direct dependency, exactly as in package.json.",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function make<T>(keys: readonly string[], properties: Record<string, unknown>, check: (record: Record<string, unknown>) => Validated<T>): JsonSchemaStandard<T> {
  const json = (): Record<string, unknown> => ({ type: "object", properties, required: [...keys], additionalProperties: false });
  const parse = (value: unknown): Validated<T> => {
    if (!isRecord(value)) return { issues: [{ message: "arguments must be an object" }] };
    const extra = Object.keys(value).filter((k) => !keys.includes(k));
    if (extra.length > 0) return { issues: [{ message: "unexpected argument" }] };
    return check(value);
  };
  return {
    parse,
    "~standard": {
      version: 1,
      vendor: "sexton",
      validate: (value) => ({ value: value as T }),
      jsonSchema: { input: json, output: json },
    },
  };
}

export const projectArguments: JsonSchemaStandard<ProjectArguments> = make(["projectDir"], { projectDir: PROJECT_DIR_SCHEMA }, (r) => {
  const dir = r["projectDir"];
  return typeof dir === "string" ? { value: { projectDir: dir } } : { issues: [{ message: "projectDir must be a string" }] };
});

export const packageArguments: JsonSchemaStandard<PackageArguments> = make(
  ["projectDir", "package"],
  { projectDir: PROJECT_DIR_SCHEMA, package: PACKAGE_SCHEMA },
  (r) => {
    const dir = r["projectDir"];
    const name = r["package"];
    if (typeof dir !== "string") return { issues: [{ message: "projectDir must be a string" }] };
    if (typeof name !== "string" || name.length < 1 || name.length > MAX_PACKAGE_NAME_CHARS) return { issues: [{ message: "package must be a string of 1 to 214 characters" }] };
    return { value: { projectDir: dir, package: name } };
  },
);
