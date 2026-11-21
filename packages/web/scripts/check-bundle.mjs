// Runs as postbuild. Reads the production build in dist only, never dist-e2e (requirement 9.6).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN = ["__sextonTiming", "axe-core"];
const dist = fileURLToPath(new URL("../dist", import.meta.url));

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

let files;
try {
  files = [...walk(dist)];
} catch {
  console.error(`check-bundle: cannot read ${dist}`);
  process.exit(1);
}
let bad = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      console.error(`check-bundle: ${file} contains ${needle}`);
      bad += 1;
    }
  }
}
if (bad > 0) process.exit(1);
console.log(`check-bundle: ${String(files.length)} files clean`);
