// Injective branch-name encoding. Spec: .kiro/specs/remediation, Requirements 4.4, 4.7. Pure.
// "/" -> "__", "_" -> "_u", "~" -> "_t", and "." -> "_d" when it touches another ".", is last,
// or is the dot of a final ".lock". The output never holds a lone "_", so decoding is unambiguous.

function escapeDot(name: string, i: number): boolean {
  return name[i - 1] === "." || name[i + 1] === "." || i === name.length - 1 || (name.endsWith(".lock") && i === name.length - 5);
}

export function encodeName(name: string): string {
  let out = "";
  for (let i = 0; i < name.length; i++) {
    const c = name[i] as string;
    if (c === "/") out += "__";
    else if (c === "_") out += "_u";
    else if (c === "~") out += "_t";
    else if (c === "." && escapeDot(name, i)) out += "_d";
    else out += c;
  }
  return out;
}

const TOKENS: Readonly<Record<string, string>> = { _: "/", u: "_", t: "~", d: "." };

/** The inverse of encodeName. Null for text that encodeName cannot have produced. */
export function decodeName(encoded: string): string | null {
  let out = "";
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded[i] as string;
    if (c !== "_") {
      out += c;
      continue;
    }
    const next = encoded[i + 1];
    if (next === undefined || !Object.hasOwn(TOKENS, next)) return null;
    out += TOKENS[next] as string;
    i++;
  }
  return encodeName(out) === encoded ? out : null;
}
