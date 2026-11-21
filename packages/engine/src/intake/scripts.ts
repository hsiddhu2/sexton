// The scripts of package.json. Spec: .kiro/specs/migration-node-sass, Requirement 8. Pure, never throws.
// JSON.parse with no reviver; own-property reads only.

export const MAX_SCRIPTS = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Own string-valued entries of a plain-object scripts, in key order, at most 100. Empty on any problem. */
export function readPackageScripts(packageJsonText: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  try {
    const root = JSON.parse(packageJsonText) as unknown;
    if (!isPlainObject(root) || !Object.hasOwn(root, "scripts")) return out;
    const scripts = root["scripts"];
    if (!isPlainObject(scripts)) return out;
    for (const name of Object.keys(scripts)) {
      if (out.size >= MAX_SCRIPTS) break;
      const command = scripts[name];
      if (typeof command === "string") out.set(name, command);
    }
  } catch {
    return new Map();
  }
  return out;
}
