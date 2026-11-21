// GitHub token provider. Spec: .kiro/specs/hosted-plans, Requirement 4.
// Reads the secret named by GITHUB_TOKEN_SECRET_ARN through the Secret port, keeps the answer for 15 minutes in the
// container (null included), and answers null for anything that is not a Token. Null is a normal state.
// Logs nothing. The token is never put in an error, a URL, a cache key or a log line.

import { isToken } from "@sexton/engine";

/** The seam over Secrets Manager. Rejects on any read failure; undefined when the secret holds no string. */
export interface SecretPort {
  secretString(secretId: string): Promise<string | undefined>;
}

export const TOKEN_SECRET_VARIABLE = "GITHUB_TOKEN_SECRET_ARN";
export const TOKEN_CACHE_MS = 15 * 60 * 1000;

export type TokenProvider = () => Promise<string | null>;

/** The secret id from the environment, null when absent or empty. */
export function tokenSecretArn(env: Readonly<Record<string, string | undefined>>): string | null {
  const value = env[TOKEN_SECRET_VARIABLE];
  return typeof value === "string" && value !== "" ? value : null;
}

async function readToken(port: SecretPort, secretId: string): Promise<string | null> {
  try {
    const value = await port.secretString(secretId);
    return isToken(value) ? value : null;
  } catch {
    return null;
  }
}

/** One provider per container. Concurrent callers share one in-flight read. */
export function createTokenProvider(port: SecretPort, secretId: string | null, now: () => number = () => Date.now()): TokenProvider {
  if (secretId === null) return () => Promise.resolve(null);
  let cached: { readonly at: number; readonly answer: Promise<string | null> } | undefined;
  return () => {
    const time = now();
    if (cached === undefined || time - cached.at >= TOKEN_CACHE_MS || time < cached.at) {
      cached = { at: time, answer: readToken(port, secretId) };
    }
    return cached.answer;
  };
}
