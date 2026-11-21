// Lambda entry for GET /api/scan. Builds the real dependencies once per container.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createFetchTransport } from "@sexton/engine";
import { AwsSecretPort } from "../aws-secret-port.js";
import { AwsDynamoPort, sdkSender } from "../dynamo/aws-port.js";
import { createTokenProvider, tokenSecretArn } from "../github-token.js";
import { createScanHandler, readScanEnvironment } from "../scan-handler.js";

const environment = readScanEnvironment(process.env);
const client = new DynamoDBClient({ maxAttempts: 3 });
// One token provider per container: the token is read at most once per 15 minutes (spec hosted-plans, 4.4).
const githubToken = createTokenProvider(new AwsSecretPort(new SecretsManagerClient({ maxAttempts: 3 })), tokenSecretArn(process.env));

export const handler = createScanHandler({
  environment,
  port: new AwsDynamoPort(sdkSender(client)),
  transport: createFetchTransport(),
  githubToken,
});
