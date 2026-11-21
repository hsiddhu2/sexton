// The vendored CycloneDX 1.5 JSON schema, compiled once for tests. Spec: .kiro/specs/evidence-pack, Requirement 2.6.
// The schema files come from https://github.com/CycloneDX/specification (Apache-2.0); see test/fixtures/cyclonedx/README.md.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import AjvModule from "ajv";
import { FIXTURES_DIR } from "../helpers.js";

type AjvConstructor = new (options: Record<string, unknown>) => {
  addSchema(schema: unknown): unknown;
  compile(schema: unknown): ((data: unknown) => boolean) & { errors?: unknown };
};
const Ajv = (AjvModule as unknown as { default: AjvConstructor }).default;

const dir = join(FIXTURES_DIR, "cyclonedx");
const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), "utf8"));

const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
ajv.addSchema(read("spdx.schema.json"));
ajv.addSchema(read("jsf-0.82.schema.json"));

/** Validates a document against bom-1.5.schema.json. */
export const validateBom = ajv.compile(read("bom-1.5.schema.json"));
