// Checks that a release tag agrees with the three packages it publishes and with server.json.
// Spec: .kiro/specs/release, Requirements 3.4, 3.5, 4.3. Pure: it takes parsed files and returns the problems.

/** The repository every published package must name. npm trusted publishing needs an exact match. */
export const REPOSITORY_URL = "git+https://github.com/hsiddhu2/sexton.git";

/** Publish order: each package after the packages it depends on. */
export const PUBLISH_ORDER = ["engine", "cli", "mcp"];

const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * @param {string} tag the pushed tag, such as "v0.1.0"
 * @param {{ engine: any, cli: any, mcp: any }} manifests the parsed package.json of each package
 * @param {any} serverJson the parsed packages/mcp/server.json
 * @returns {string[]} one line per problem; empty when the release may go ahead
 */
export function releaseProblems(tag, manifests, serverJson) {
  const problems = [];
  const { engine, cli, mcp } = manifests;
  if (!TAG.test(tag)) problems.push(`the tag ${tag} is not vMAJOR.MINOR.PATCH`);
  const version = tag.slice(1);
  for (const pkg of [cli, mcp]) {
    if (pkg.version !== version) problems.push(`${pkg.name} is ${pkg.version}, the tag says ${version}`);
  }
  const pins = [
    [cli, engine],
    [mcp, engine],
    [mcp, cli],
  ];
  for (const [from, to] of pins) {
    const pinned = from.dependencies?.[to.name];
    if (pinned !== to.version) problems.push(`${from.name} depends on ${to.name} ${String(pinned)}, not ${to.version}`);
  }
  for (const key of PUBLISH_ORDER) {
    const pkg = manifests[key];
    if (pkg.private === true) problems.push(`${pkg.name} is private`);
    if (pkg.publishConfig?.access !== "public") problems.push(`${pkg.name} has no publishConfig.access public`);
    if (pkg.publishConfig?.provenance !== true) problems.push(`${pkg.name} has no publishConfig.provenance true`);
    if (pkg.repository?.url !== REPOSITORY_URL) problems.push(`${pkg.name} repository.url is not ${REPOSITORY_URL}`);
  }
  const entry = serverJson?.packages?.[0];
  if (serverJson?.name !== mcp.mcpName) problems.push(`server.json name ${String(serverJson?.name)} is not mcpName ${String(mcp.mcpName)}`);
  if (serverJson?.version !== mcp.version) problems.push(`server.json version ${String(serverJson?.version)} is not ${mcp.version}`);
  if (entry?.identifier !== mcp.name) problems.push(`server.json package ${String(entry?.identifier)} is not ${mcp.name}`);
  if (entry?.version !== mcp.version) problems.push(`server.json package version ${String(entry?.version)} is not ${mcp.version}`);
  return problems;
}
