// DynamoPort adapter onto @aws-sdk/client-dynamodb. Spec: .kiro/specs/infra, Requirements 2.1, 3.1, 3.6.
// A thin mapping. The client is built by the caller and passed in.

import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
  type DynamoDBClient,
  type GetItemCommandInput,
  type GetItemCommandOutput,
  type PutItemCommandInput,
  type PutItemCommandOutput,
  type QueryCommandInput,
  type QueryCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { ConditionFailedError, ItemTooLargeError, type AttrValue, type DynamoPort, type Item, type PutOptions, type QueryInput } from "./port.js";

/** The three SDK calls the adapter makes. Tests replace it with a stub that returns recorded outputs. */
export interface DynamoSender {
  getItem(input: GetItemCommandInput): Promise<GetItemCommandOutput>;
  putItem(input: PutItemCommandInput): Promise<PutItemCommandOutput>;
  query(input: QueryCommandInput): Promise<QueryCommandOutput>;
}

/** Guards against a paging loop that never ends. 1000 pages of 1 MB is far beyond any Sexton partition. */
export const MAX_QUERY_PAGES = 1000;

export const NOT_EXISTS_CONDITION = "attribute_not_exists(#pk)";

export function sdkSender(client: Pick<DynamoDBClient, "send">): DynamoSender {
  return {
    getItem: (input) => client.send(new GetItemCommand(input)),
    putItem: (input) => client.send(new PutItemCommand(input)),
    query: (input) => client.send(new QueryCommand(input)),
  };
}

function attrToSdk(value: AttrValue): AttributeValue {
  if ("S" in value) return { S: value.S };
  if ("N" in value) return { N: value.N };
  return { B: value.B };
}

function toSdk(item: Item): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const [name, value] of Object.entries(item)) out[name] = attrToSdk(value);
  return out;
}

/** Keeps the S, N and B attributes. Any other type is dropped, as no Sexton item writes one. */
function fromSdk(item: Record<string, AttributeValue>): Item {
  const out: Record<string, AttrValue> = {};
  for (const [name, value] of Object.entries(item)) {
    if (typeof value.S === "string") out[name] = { S: value.S };
    else if (typeof value.N === "string") out[name] = { N: value.N };
    else if (value.B instanceof Uint8Array) out[name] = { B: value.B };
  }
  return out;
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

/** Maps the two SDK errors the stores act on. Every other error is rethrown unchanged. */
function mapError(error: unknown): unknown {
  const name = errorName(error);
  if (name === "ConditionalCheckFailedException") return new ConditionFailedError();
  if (name === "ValidationException" && /item size/i.test(errorMessage(error))) return new ItemTooLargeError();
  return error;
}

export class AwsDynamoPort implements DynamoPort {
  constructor(private readonly sender: DynamoSender) {}

  async getItem(table: string, key: Item): Promise<Item | undefined> {
    try {
      const output = await this.sender.getItem({ TableName: table, Key: toSdk(key), ConsistentRead: false });
      return output.Item === undefined ? undefined : fromSdk(output.Item);
    } catch (error) {
      throw mapError(error);
    }
  }

  async putItem(table: string, item: Item, options: PutOptions = {}): Promise<void> {
    const input: PutItemCommandInput =
      options.ifNotExists === true
        ? { TableName: table, Item: toSdk(item), ConditionExpression: NOT_EXISTS_CONDITION, ExpressionAttributeNames: { "#pk": options.conditionKey ?? "pk" } }
        : { TableName: table, Item: toSdk(item) };
    try {
      await this.sender.putItem(input);
    } catch (error) {
      throw mapError(error);
    }
  }

  async query(query: QueryInput): Promise<readonly Item[]> {
    const names: Record<string, string> = { "#p": query.partition.name };
    const values: Record<string, AttributeValue> = { ":p": { S: query.partition.value } };
    let condition = "#p = :p";
    if (query.sortBetween !== undefined) {
      names["#s"] = query.sortBetween.name;
      values[":lo"] = attrToSdk(query.sortBetween.low);
      values[":hi"] = attrToSdk(query.sortBetween.high);
      condition += " AND #s BETWEEN :lo AND :hi";
    }
    let projection: string | undefined;
    if (query.projection !== undefined && query.projection.length > 0) {
      projection = query.projection
        .map((attribute, index) => {
          names[`#a${String(index)}`] = attribute;
          return `#a${String(index)}`;
        })
        .join(", ");
    }
    const base: QueryCommandInput = {
      TableName: query.table,
      KeyConditionExpression: condition,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ScanIndexForward: true,
      ...(query.index !== undefined ? { IndexName: query.index } : {}),
      ...(projection !== undefined ? { ProjectionExpression: projection } : {}),
    };

    const items: Item[] = [];
    let start: Record<string, AttributeValue> | undefined;
    for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
      let output: QueryCommandOutput;
      try {
        output = await this.sender.query(start === undefined ? base : { ...base, ExclusiveStartKey: start });
      } catch (error) {
        throw mapError(error);
      }
      for (const item of output.Items ?? []) items.push(fromSdk(item));
      start = output.LastEvaluatedKey;
      if (start === undefined) return items;
    }
    throw new Error("query exceeded the page limit");
  }
}
