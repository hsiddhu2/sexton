// CycloneDX 1.5 JSON SBOM of the direct dependencies, written by hand. Spec: .kiro/specs/evidence-pack, Requirement 2.
// Checked in tests against the official schema in test/fixtures/cyclonedx. No licences, no component hashes:
// Sexton collects neither. Pure apart from the Web Crypto digest for the serial number.

import { UNRESOLVED_VERSION } from "../intake/resolve.js";
import type {
  CycloneDxBom,
  CycloneDxComponent,
  CycloneDxProperty,
  IntakePackage,
  PackageHealth,
  RepoRef,
} from "../types.js";
import { ENGINE_VERSION, REPO_URL } from "../version.js";
import { canonicalJson, cleanJsonCopy } from "./canonical-json.js";
import { npmPurl } from "./purl.js";
import { sha256Hex } from "./sha256.js";

export const SBOM_SCOPE_PROPERTY: CycloneDxProperty = { name: "sexton:sbom:scope", value: "direct-dependencies" };
/** Registered in https://github.com/CycloneDX/cyclonedx-property-taxonomy/blob/main/cdx/npm.md. */
export const NPM_DEVELOPMENT_PROPERTY = "cdx:npm:package:development";

export interface SbomInput {
  readonly repo: RepoRef;
  readonly commit: string | null;
  readonly generatedAt: string;
  readonly packages: readonly PackageHealth[];
  readonly dependencies: readonly IntakePackage[];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function component(pkg: PackageHealth, intake: IntakePackage | undefined): CycloneDxComponent {
  const slash = pkg.name.startsWith("@") ? pkg.name.indexOf("/") : -1;
  const version = pkg.installedVersion === UNRESOLVED_VERSION ? null : pkg.installedVersion;
  const purl = npmPurl(pkg.name, version);
  const dev = intake?.origin === "devDependencies";
  const properties: CycloneDxProperty[] = [{ name: "sexton:state", value: pkg.state }];
  if (intake !== undefined) properties.push({ name: "sexton:resolution", value: intake.resolution });
  if (dev) properties.push({ name: NPM_DEVELOPMENT_PROPERTY, value: "true" });
  return {
    type: "library",
    ...(slash > 0 ? { group: pkg.name.slice(0, slash), name: pkg.name.slice(slash + 1) } : { name: pkg.name }),
    ...(version === null ? {} : { version }),
    purl,
    "bom-ref": purl,
    ...(dev ? { scope: "excluded" as const } : {}),
    properties,
  };
}

/** UUID from the first 16 bytes of the hex digest, version nibble 8, variant bits 10. */
function uuidFrom(digestHex: string): string {
  const bytes = Array.from({ length: 16 }, (_, i) => parseInt(digestHex.slice(i * 2, i * 2 + 2), 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const h = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Builds the SBOM. The serial number is derived from the canonical BOM without it, so equal input gives an equal BOM. */
export async function buildSbom(input: SbomInput): Promise<CycloneDxBom> {
  const root = input.repo.url;
  const firstByName = new Map<string, PackageHealth>();
  for (const pkg of input.packages) if (!firstByName.has(pkg.name)) firstByName.set(pkg.name, pkg);
  const intakeByName = new Map<string, IntakePackage>();
  for (const dep of input.dependencies) if (!intakeByName.has(dep.name)) intakeByName.set(dep.name, dep);

  const components = [...firstByName.values()]
    .sort((a, b) => compare(a.name, b.name))
    .map((pkg) => component(pkg, intakeByName.get(pkg.name)));
  const refs = components.map((c) => c["bom-ref"] ?? "").sort(compare);

  const rest = {
    metadata: {
      timestamp: input.generatedAt,
      tools: {
        components: [
          { type: "application" as const, name: "sexton", version: ENGINE_VERSION, externalReferences: [{ type: "vcs" as const, url: REPO_URL }] },
        ],
      },
      component: {
        type: "application" as const,
        name: `${input.repo.owner}/${input.repo.repo}`,
        "bom-ref": root,
        ...(input.commit === null ? {} : { version: input.commit }),
        externalReferences: [{ type: "vcs" as const, url: root }],
      },
      properties: [{ ...SBOM_SCOPE_PROPERTY }],
    },
    components,
    dependencies: [{ ref: root, dependsOn: refs }],
    compositions: [{ aggregate: "incomplete" as const, assemblies: [root], dependencies: [root] }],
  };
  const head = { bomFormat: "CycloneDX" as const, specVersion: "1.5" as const, version: 1 as const };
  // Over the Clean copy, the same text the pack digest will see once the body is cleaned.
  const clean = cleanJsonCopy({ ...head, ...rest });
  const text = clean.ok ? canonicalJson(clean.value) : null;
  if (text === null) throw new Error("sbom is not serialisable");
  const serialNumber = `urn:uuid:${uuidFrom(await sha256Hex(new TextEncoder().encode(text)))}`;
  return { ...head, serialNumber, ...rest };
}
