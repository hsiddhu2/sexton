// SHA-256 through Web Crypto, so the engine needs no node: import. Spec: .kiro/specs/evidence-pack, Requirements 1.5, 1.6.

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lower-case hex SHA-256 of the bytes. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

/** Lower-case hex SHA-256 of the UTF-8 bytes of the text. */
export async function sha256HexOfText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}
