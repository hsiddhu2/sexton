import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// A string path, not a URL object: under jsdom the global URL class is not Node's.
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/replay");

/** The generated replay fixture body (spec cemetery-time, 17). */
export function readReplayText(id: "axios" | "keyv"): string {
  return readFileSync(resolve(DIR, `${id}.json`), "utf8");
}

export function readReplay(id: "axios" | "keyv"): unknown {
  return JSON.parse(readReplayText(id)) as unknown;
}

/** The sequence of design.md "Replay facts", with the expected state and reason of each Stop. */
export const EXPECTED_SEGMENTS = {
  axios: [
    { from: "2026-03-30T23:21:58.168Z", version: "1.14.0", state: "Alive", reason: "no rule matched" },
    { from: "2026-03-31T00:21:58.168Z", version: "1.14.1", state: "Possessed", reason: "provenance regression: 1.14.1 has no provenance, 1.14.0 had it" },
    { from: "2026-03-31T03:29:00.000Z", version: "1.14.0", state: "Alive", reason: "no rule matched" },
  ],
  keyv: [
    { from: "2026-08-04T08:35:00.763Z", version: "5.6.0", state: "Alive", reason: "no rule matched" },
    { from: "2026-08-04T09:35:00.763Z", version: "6.0.0", state: "Possessed", reason: "install script added in 6.0.0" },
  ],
} as const;

export const EIGHT_URLS: readonly string[] = [
  "https://www.trendmicro.com/en_us/research/26/c/axios-npm-package-compromised.html",
  "https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-002/",
  "https://docs.npmjs.com/trusted-publishers",
  "https://snyk.io/blog/inside-keyv-npm-compromise-preinstall-malware-trusted-provenance-ide-hooks/",
  "https://osv.dev/vulnerability/MAL-2026-11524",
  "https://github.com/jaredwray/cacheable/issues/1692",
  "https://registry.npmjs.org/axios",
  "https://registry.npmjs.org/keyv",
];
