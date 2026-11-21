// The token provider. Spec: .kiro/specs/hosted-plans, Requirement 4. Property 59.

import fc from "fast-check";
import { TOKEN_PATTERN } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { AwsSecretPort } from "../src/aws-secret-port.js";
import { createTokenProvider, TOKEN_CACHE_MS, tokenSecretArn, type SecretPort } from "../src/github-token.js";

const ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:sexton/github-token-dev-AbCdEf";
const TOKEN = ["ghp", "x".repeat(36)].join("_");

function port(answer: () => Promise<string | undefined>): SecretPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    secretString: (id) => {
      calls.push(id);
      return answer();
    },
  };
}

describe("tokenSecretArn (4.1, 4.2)", () => {
  it("reads the variable and answers null when absent or empty", () => {
    expect(tokenSecretArn({ GITHUB_TOKEN_SECRET_ARN: ARN })).toBe(ARN);
    expect(tokenSecretArn({ GITHUB_TOKEN_SECRET_ARN: "" })).toBeNull();
    expect(tokenSecretArn({})).toBeNull();
  });
});

describe("createTokenProvider (4.2 to 4.4)", () => {
  it("makes no port call without a secret id", async () => {
    const p = port(() => Promise.resolve(TOKEN));
    expect(await createTokenProvider(p, null)()).toBeNull();
    expect(p.calls).toEqual([]);
  });

  it("answers a valid token and caches it for 15 minutes, sharing one read", async () => {
    let now = 0;
    const p = port(() => Promise.resolve(TOKEN));
    const provider = createTokenProvider(p, ARN, () => now);
    expect(await Promise.all([provider(), provider()])).toEqual([TOKEN, TOKEN]);
    now = TOKEN_CACHE_MS - 1;
    expect(await provider()).toBe(TOKEN);
    expect(p.calls).toEqual([ARN]);
    now = TOKEN_CACHE_MS;
    await provider();
    expect(p.calls).toHaveLength(2);
  });

  it("caches a failure as null too", async () => {
    let now = 0;
    const p = port(() => Promise.reject(new Error("ResourceNotFoundException")));
    const provider = createTokenProvider(p, ARN, () => now);
    expect(await provider()).toBeNull();
    now = 1000;
    expect(await provider()).toBeNull();
    expect(p.calls).toHaveLength(1);
  });

  it.each([undefined, "", " ", `${TOKEN}\n`, `Bearer ${TOKEN}`, '{"token":"x"}'])("answers null for %j", async (value) => {
    expect(await createTokenProvider(port(() => Promise.resolve(value)), ARN)()).toBeNull();
  });
});

describe("Feature: hosted-plans, Property 59: the provider answers null for non-tokens", () => {
  it("answers null for every value that does not match the Token pattern", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.string(), fc.string().map((s) => `ghp_${s}`), fc.string().map((s) => `github_pat_${s}`)).filter((s) => !TOKEN_PATTERN.test(s)),
        async (value) => {
          expect(await createTokenProvider(port(() => Promise.resolve(value)), ARN)()).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("AwsSecretPort (4.1)", () => {
  it("sends GetSecretValue for the id and answers SecretString", async () => {
    const sent: unknown[] = [];
    const client = {
      send: (command: { input: unknown }) => {
        sent.push(command.input);
        return Promise.resolve({ SecretString: TOKEN });
      },
    };
    expect(await new AwsSecretPort(client as never).secretString(ARN)).toBe(TOKEN);
    expect(sent).toEqual([{ SecretId: ARN }]);
    const binary = { send: () => Promise.resolve({ SecretBinary: new Uint8Array([1]) }) };
    expect(await new AwsSecretPort(binary as never).secretString(ARN)).toBeUndefined();
  });
});
