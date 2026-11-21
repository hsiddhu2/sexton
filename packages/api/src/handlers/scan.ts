// Lambda entry for GET /api/scan. Builds the real dependencies once per container.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createFetchTransport } from "@sexton/engine";
import { AwsDynamoPort, sdkSender } from "../dynamo/aws-port.js";
import { createScanHandler, readScanEnvironment } from "../scan-handler.js";

const environment = readScanEnvironment(process.env);
const client = new DynamoDBClient({ maxAttempts: 3 });

export const handler = createScanHandler({
  environment,
  port: new AwsDynamoPort(sdkSender(client)),
  transport: createFetchTransport(),
});
