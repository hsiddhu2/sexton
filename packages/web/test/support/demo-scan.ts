import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A string path, not a URL object: under jsdom the global URL class is not Node's.
const DEMO_SCAN_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/demo/scan.json");

/** Reads the generated Demo scan body from disk. Fails clearly if the generator has not run. */
export function readDemoScanText(): string {
  if (!existsSync(DEMO_SCAN_PATH)) {
    throw new Error(
      `Demo scan not found at ${DEMO_SCAN_PATH}. Run "npm run demo:generate -w @sexton/api" first (web's pretest does this).`,
    );
  }
  return readFileSync(DEMO_SCAN_PATH, "utf8");
}

/** The generated Demo scan, parsed. Typed unknown: tests pass it through validateScanResponse. */
export function readDemoScan(): unknown {
  return JSON.parse(readDemoScanText()) as unknown;
}
