// Lambda entry for the daily snapshotter. Builds the real dependencies once per container.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createFetchTransport } from "@sexton/engine";
import { AwsDynamoPort, sdkSender } from "../dynamo/aws-port.js";
import { readScanEnvironment } from "../scan-handler.js";
import { createSnapshotterHandler } from "../snapshotter-handler.js";

const environment = readScanEnvironment(process.env);
const client = new DynamoDBClient({ maxAttempts: 3 });

export const handler = createSnapshotterHandler({
  environment,
  port: new AwsDynamoPort(sdkSender(client)),
  transport: createFetchTransport(),
});
