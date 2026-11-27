// Builds the two npm packages of a release, sexton and sexton-mcp, each one folder with one bundled file.
// Spec: .kiro/specs/release, Requirement 2, Decision 1. Run `npm run build` first (the release workflow does).
// Usage: node scripts/build-release.mjs [--out <dir>]. Default output: build/release/<name>/ for each package.
// Each folder: package.json (no dependency), <bin>.mjs (the bundle), README.md, LICENSE, NOTICE, THIRD-PARTY-NOTICES.md.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { bundle, loadEsbuild } from "./lib/bundle.mjs";
import { publishedManifest, RELEASE_PACKAGES, thirdPartyDirs } from "./lib/release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const flag = process.argv.indexOf("--out");
const outArg = flag === -1 ? undefined : process.argv[flag + 1];
if (process.argv.length !== (flag === -1 ? 2 : 4) || (flag !== -1 && (outArg === undefined || outArg === "" || outArg.startsWith("--")))) {
  console.error("usage: node scripts/build-release.mjs [--out <dir>]");
  process.exit(2);
}
// A missing or empty --out stops above: each package folder under the output is emptied, so it must never default to the current directory.
const out = resolve(outArg ?? resolve(root, "build/release"));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const NOTICE_FILE = /^notice(\.(md|txt))?$/i;
// The same file on every platform: the shortest name first, then by code unit.
const pick = (files, pattern) => files.filter((f) => pattern.test(f)).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))[0];
const licenceName = (field) => (typeof field === "string" ? field : typeof field?.type === "string" ? field.type : "see the licence text");

for (const def of RELEASE_PACKAGES) {
  const entry = `packages/${def.workspace}/dist/bin.js`;
  if (!existsSync(resolve(root, entry))) {
    console.error(`build-release: ${entry} is missing. Run npm run build first.`);
    process.exit(2);
  }
}
const esbuild = await loadEsbuild("build-release");

for (const def of RELEASE_PACKAGES) {
  const dir = join(out, def.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, `${def.bin}.mjs`);
  const result = await bundle(esbuild, { root, entry: `packages/${def.workspace}/dist/bin.js`, outfile: bin });
  chmodSync(bin, 0o755);

  const notices = ["# Third-party notices", "", `\`${def.bin}.mjs\` is one file that contains the code of the packages below, unmodified apart from bundling, at the versions in Sexton's \`package-lock.json\`. Each licence text is copied from the package itself.`, ""];
  for (const pkgDir of thirdPartyDirs(Object.keys(result.metafile.inputs))) {
    const abs = resolve(root, pkgDir);
    const meta = readJson(join(abs, "package.json"));
    const files = readdirSync(abs);
    const licence = pick(files, LICENCE_FILE);
    if (licence === undefined) {
      console.error(`build-release: ${meta.name}@${meta.version} has no licence file; it cannot be redistributed in ${def.name}.`);
      process.exit(1);
    }
    notices.push(`## ${meta.name} ${meta.version}`, "", `Licence: ${licenceName(meta.license)}`, "", "```text", readFileSync(join(abs, licence), "utf8").trimEnd(), "```", "");
    const notice = pick(files, NOTICE_FILE);
    if (notice !== undefined) notices.push("```text", readFileSync(join(abs, notice), "utf8").trimEnd(), "```", "");
  }
  writeFileSync(join(dir, "THIRD-PARTY-NOTICES.md"), notices.join("\n"));

  const version = readJson(resolve(root, `packages/${def.workspace}/package.json`)).version;
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(publishedManifest(def, version), null, 2)}\n`);
  copyFileSync(resolve(root, `packages/${def.workspace}/README.md`), join(dir, "README.md"));
  copyFileSync(resolve(root, "LICENSE"), join(dir, "LICENSE"));
  copyFileSync(resolve(root, "NOTICE"), join(dir, "NOTICE"));
  console.log(`build-release: wrote ${def.name}@${version} to ${dir}`);
}
