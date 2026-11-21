// Pure collector for the self-scan (cemetery-theme Requirement 7). No I/O, no imports.

/**
 * @typedef {{ name?: string, dependencies?: Record<string, string>, devDependencies?: Record<string, string> }} Manifest
 */

/**
 * @param {{ root: Manifest, workspaces: { dir: string, manifest: Manifest }[], lock: { packages?: Record<string, { version?: string }> } }} input
 * @returns {{ name: string, installedVersion: string }[]}
 */
export function collectDirect({ root, workspaces, lock }) {
  const internal = new Set(workspaces.map((w) => w.manifest.name).filter((n) => typeof n === "string"));
  const rows = new Map(); // key "name@version"
  const declare = (manifest, dir) => {
    const names = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];
    for (const name of names) {
      if (internal.has(name)) continue;
      const candidates = dir === null ? [`node_modules/${name}`] : [`${dir}/node_modules/${name}`, `node_modules/${name}`];
      const version = candidates.map((k) => lock.packages?.[k]?.version).find((v) => typeof v === "string");
      if (version === undefined) throw new Error(`no locked version for ${name} (declared in ${dir ?? "."})`);
      rows.set(`${name}@${version}`, { name, installedVersion: version });
    }
  };
  declare(root, null);
  for (const w of workspaces) declare(w.manifest, w.dir);
  return [...rows.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.installedVersion < b.installedVersion ? -1 : a.installedVersion > b.installedVersion ? 1 : 0,
  );
}
