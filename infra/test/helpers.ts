// Builds the app once per test file with placeholder handlers and the web fixture, so tests
// need no esbuild output, no network and no AWS credentials.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Template } from "aws-cdk-lib/assertions";
import { buildApp, type SextonApp } from "../lib/app.js";

export const WEB_FIXTURE = fileURLToPath(new URL("./fixtures/web", import.meta.url));
export const DESIGN_PATH = fileURLToPath(new URL("../../.kiro/specs/infra/design.md", import.meta.url));

export interface Built extends SextonApp {
  readonly dataTemplate: Template;
  readonly edgeTemplate: Template;
}

export function build(options: { readonly web?: boolean } = {}): Built {
  const built = buildApp({
    scanCode: { kind: "placeholder" },
    snapshotterCode: { kind: "placeholder" },
    webAssetPath: options.web === false ? null : WEB_FIXTURE,
    outdir: mkdtempSync(join(tmpdir(), "sexton-cdk-")),
  });
  return {
    ...built,
    dataTemplate: Template.fromStack(built.data),
    edgeTemplate: Template.fromStack(built.edge),
  };
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function resourcesOfType(template: Template, type: string): [string, { Properties?: Record<string, Json> }][] {
  const all = template.toJSON()["Resources"] as Record<string, { Type: string; Properties?: Record<string, Json> }>;
  return Object.entries(all).filter(([, r]) => r.Type === type);
}
