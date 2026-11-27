// The two npm packages of a Sexton release, and the checks a release must pass. Pure: no file, no network.
// Spec: .kiro/specs/release, Requirements 2, 3.5 and 4.

/** The repository every published package names. npm trusted publishing needs an exact match. */
export const REPOSITORY_URL = "git+https://github.com/hsiddhu2/sexton.git";

/** The lowest Node the bundles run on: the Bundle target is node20, and Kiro starts servers on 20.19.5. */
export const NODE_FLOOR = ">=20.19.0";

/** The files each published folder holds. npm adds package.json, README.md and LICENSE on its own. */
export const RELEASE_FILES = (bin) => [`${bin}.mjs`, "NOTICE", "THIRD-PARTY-NOTICES.md"];

/**
 * The published packages, in publish order. Each is one bundled file built from a workspace package.
 * `workspace` is the folder under packages/ whose dist/bin.js is the entry and whose package.json gives the version.
 */
export const RELEASE_PACKAGES = [
  {
    name: "sexton",
    workspace: "cli",
    bin: "sexton",
    description: "Sexton command line: score every direct npm dependency of a repository, check your policy, write an evidence pack.",
    keywords: ["supply-chain", "npm", "dependencies", "security", "sbom", "cli"],
  },
  {
    name: "sexton-mcp",
    workspace: "mcp",
    bin: "sexton-mcp",
    mcpName: "io.github.hsiddhu2/sexton",
    description: "Sexton MCP server: read-only answers about the npm dependencies of a project on your machine.",
    keywords: ["mcp", "model-context-protocol", "supply-chain", "npm", "dependencies"],
  },
];

const REPO_WEB = "https://github.com/hsiddhu2/sexton";

/**
 * The package.json of one published package, from its definition and its workspace package's version.
 * It has no dependency of any kind: the bundle holds everything it runs.
 */
export function publishedManifest(def, workspaceVersion) {
  return {
    name: def.name,
    version: workspaceVersion,
    description: def.description,
    keywords: def.keywords,
    license: "Apache-2.0",
    author: "Harpreet Singh Siddhu",
    repository: { type: "git", url: REPOSITORY_URL, directory: `packages/${def.workspace}` },
    homepage: `${REPO_WEB}#readme`,
    bugs: { url: `${REPO_WEB}/issues` },
    type: "module",
    bin: { [def.bin]: `${def.bin}.mjs` },
    files: RELEASE_FILES(def.bin),
    engines: { node: NODE_FLOOR },
    publishConfig: { access: "public", provenance: true },
    ...(def.mcpName === undefined ? {} : { mcpName: def.mcpName }),
  };
}

/**
 * The third-party packages in a bundle, from the input paths of esbuild's metafile (relative to the repository root).
 * A path inside node_modules names the package after the last node_modules; workspace code (packages/...) is not third-party.
 * @returns {string[]} package directories relative to the root, such as "node_modules/ajv", sorted by package name, without duplicates
 */
export function thirdPartyDirs(inputPaths) {
  const dirs = new Set();
  for (const path of inputPaths) {
    const parts = path.split("/");
    const at = parts.lastIndexOf("node_modules");
    if (at === -1) continue;
    const width = parts[at + 1]?.startsWith("@") ? 2 : 1;
    if (parts.length <= at + width) continue;
    dirs.add(parts.slice(0, at + 1 + width).join("/"));
  }
  const nameOf = (dir) => dir.slice(dir.lastIndexOf("node_modules/") + "node_modules/".length);
  return [...dirs].sort((a, b) => (nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DEPENDENCY_KEYS = ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"];

/**
 * Every reason the release may not go ahead.
 * @param {string} tag the pushed tag, such as "v0.1.0"
 * @param {any[]} manifests the built package.json of each published package, in RELEASE_PACKAGES order
 * @param {any} serverJson the parsed packages/mcp/server.json
 * @returns {string[]} one line per problem; empty when the release may go ahead
 */
export function releaseProblems(tag, manifests, serverJson) {
  const problems = [];
  if (!TAG.test(tag)) problems.push(`the tag ${tag} is not vMAJOR.MINOR.PATCH`);
  const version = tag.slice(1);
  RELEASE_PACKAGES.forEach((def, i) => {
    const pkg = manifests[i] ?? {};
    const label = String(pkg.name ?? def.name);
    if (pkg.name !== def.name) problems.push(`package ${i + 1} is ${String(pkg.name)}, not ${def.name}`);
    if (pkg.version !== version) problems.push(`${label} is ${String(pkg.version)}, the tag says ${version}`);
    if (pkg.private === true) problems.push(`${label} is private`);
    for (const key of DEPENDENCY_KEYS) if (pkg[key] !== undefined) problems.push(`${label} has ${key}; the bundle must hold everything`);
    if (pkg.bin?.[def.bin] !== `${def.bin}.mjs` || Object.keys(pkg.bin ?? {}).length !== 1) problems.push(`${label} must have exactly one bin, ${def.bin} -> ${def.bin}.mjs`);
    if (pkg.scripts !== undefined) problems.push(`${label} has scripts; none may run in the publish job`);
    if (pkg.publishConfig?.access !== "public") problems.push(`${label} has no publishConfig.access public`);
    if (pkg.publishConfig?.provenance !== true) problems.push(`${label} has no publishConfig.provenance true`);
    if (pkg.repository?.url !== REPOSITORY_URL) problems.push(`${label} repository.url is not ${REPOSITORY_URL}`);
    if (pkg.engines?.node !== NODE_FLOOR) problems.push(`${label} engines.node is not ${NODE_FLOOR}`);
  });
  const server = manifests[RELEASE_PACKAGES.findIndex((d) => d.mcpName !== undefined)] ?? {};
  const entry = serverJson?.packages?.[0];
  if (serverJson?.name !== server.mcpName) problems.push(`server.json name ${String(serverJson?.name)} is not mcpName ${String(server.mcpName)}`);
  if (serverJson?.version !== server.version) problems.push(`server.json version ${String(serverJson?.version)} is not ${String(server.version)}`);
  if (entry?.identifier !== server.name) problems.push(`server.json package ${String(entry?.identifier)} is not ${String(server.name)}`);
  if (entry?.version !== server.version) problems.push(`server.json package version ${String(entry?.version)} is not ${String(server.version)}`);
  return problems;
}
