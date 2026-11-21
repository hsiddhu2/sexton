// Secret port adapter onto @aws-sdk/client-secrets-manager. Spec: .kiro/specs/hosted-plans, Requirement 4.1.
// The only file that imports the Secrets Manager client. A thin mapping; the client is built by the caller.

import { GetSecretValueCommand, type SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { SecretPort } from "./github-token.js";

export class AwsSecretPort implements SecretPort {
  constructor(private readonly client: Pick<SecretsManagerClient, "send">) {}

  async secretString(secretId: string): Promise<string | undefined> {
    const output = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }));
    return typeof output.SecretString === "string" ? output.SecretString : undefined;
  }
}
