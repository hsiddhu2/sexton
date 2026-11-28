// One esbuild configuration for every single-file Sexton build: the Kiro Power's Bundle and the two npm packages.
// Specs: .kiro/specs/sexton-power Decision 8, .kiro/specs/release Decision 1.
// Node 20 is the version Kiro starts the Power's server with, and the floor of the published packages.

/**
 * Bundles one entry file into one ES module with every dependency inside.
 * @param {any} esbuild the esbuild module, imported by the caller
 * @param {{ root: string, entry: string, outfile: string }} target paths: the repository root, the entry relative to it, the output file
 * @returns {Promise<any>} esbuild's result, with its metafile
 */
export function bundle(esbuild, { root, entry, outfile }) {
  return esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    legalComments: "none",
    minify: false,
    sourcemap: false,
    metafile: true,
    outfile,
    logLevel: "warning",
    banner: { js: 'import { createRequire as __sextonRequire } from "node:module"; const require = __sextonRequire(import.meta.url);' },
  });
}

/** Loads esbuild from the workspace, or exits with a clear message. */
export async function loadEsbuild(tool) {
  try {
    return await import("esbuild");
  } catch {
    console.error(`${tool}: esbuild is not installed. Run npm ci.`);
    process.exit(2);
  }
}
