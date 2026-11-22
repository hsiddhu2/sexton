// Lambda entry for POST /api/remediate. Builds the real dependencies once per container. Spec: .kiro/specs/remediate.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createFetchTransport } from "@sexton/engine";
import { AwsSecretPort } from "../aws-secret-port.js";
import { AwsDynamoPort, sdkSender } from "../dynamo/aws-port.js";
import { createTokenProvider, tokenSecretArn } from "../github-token.js";
import { ALLOWLIST_VARIABLE, parseAllowlist } from "../remediate/allowlist.js";
import { createRemediateHandler, readRemediateEnvironment } from "../remediate-handler.js";

const environment = readRemediateEnvironment(process.env);
const client = new DynamoDBClient({ maxAttempts: 3 });
const githubToken = createTokenProvider(new AwsSecretPort(new SecretsManagerClient({ maxAttempts: 3 })), tokenSecretArn(process.env));

export const handler = createRemediateHandler({
  environment,
  allow: parseAllowlist(process.env[ALLOWLIST_VARIABLE]),
  port: new AwsDynamoPort(sdkSender(client)),
  transport: createFetchTransport(),
  githubToken,
});
