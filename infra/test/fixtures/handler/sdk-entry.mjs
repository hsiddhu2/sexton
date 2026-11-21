// Bundling fixture: a handler that imports the DynamoDB client, as the real handlers do.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const handler = async () => typeof DynamoDBClient;
