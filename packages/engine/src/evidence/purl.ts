// Package URL for an npm package. Spec: .kiro/specs/evidence-pack, Requirement 2.8.
// npm type: https://github.com/package-url/purl-spec/blob/main/types/npm-definition.json (the scope is the namespace,
// its @ always percent-encoded). Encoding: ECMA-427 section 5.4, https://ecma-tc54.github.io/ECMA-427/ (letters, digits,
// . - _ ~ and the colon are never encoded; every other UTF-8 byte becomes %XX). Pure.

import { UNRESOLVED_VERSION } from "../intake/resolve.js";

const KEEP = /^[A-Za-z0-9._~:-]$/;

function encode(component: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(component)) {
    const ch = String.fromCharCode(byte);
    out += byte < 0x80 && KEEP.test(ch) ? ch : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** pkg:npm/[%40scope/]name[@version]. No version part when the version is null or unresolved. */
export function npmPurl(name: string, version: string | null): string {
  const slash = name.startsWith("@") ? name.indexOf("/") : -1;
  const path = slash > 0 ? `${encode(name.slice(0, slash))}/${encode(name.slice(slash + 1))}` : encode(name);
  const suffix = version === null || version === UNRESOLVED_VERSION ? "" : `@${encode(version)}`;
  return `pkg:npm/${path}${suffix}`;
}
