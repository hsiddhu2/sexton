// A stub DynamoSender for AwsDynamoPort tests. It reads the SDK inputs the adapter builds, answers from a
// MemoryDynamo, pages Query results, and throws errors with the names the real SDK uses. No network.

import type {
  AttributeValue,
  GetItemCommandInput,
  GetItemCommandOutput,
  PutItemCommandInput,
  PutItemCommandOutput,
  QueryCommandInput,
  QueryCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { NOT_EXISTS_CONDITION, type DynamoSender } from "../../src/dynamo/aws-port.js";
import { ConditionFailedError, ItemTooLargeError, type AttrValue, type Item, type QueryInput } from "../../src/dynamo/port.js";
import { MemoryDynamo } from "./memory-dynamo.js";

const META = { $metadata: {} } as const;

function sdkError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function attr(value: AttributeValue | undefined): AttrValue {
  if (value?.S !== undefined) return { S: value.S };
  if (value?.N !== undefined) return { N: value.N };
  if (value?.B !== undefined) return { B: value.B };
  throw new Error("stub: unsupported attribute value");
}

function toItem(record: Record<string, AttributeValue> | undefined): Item {
  if (record === undefined) throw new Error("stub: missing item");
  return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, attr(value)]));
}

function toSdk(item: Item): Record<string, AttributeValue> {
  return Object.fromEntries(Object.entries(item).map(([name, value]) => [name, "S" in value ? { S: value.S } : "N" in value ? { N: value.N } : { B: value.B }]));
}

function translate(error: unknown): unknown {
  if (error instanceof ConditionFailedError) return sdkError("ConditionalCheckFailedException", "The conditional request failed");
  if (error instanceof ItemTooLargeError) return sdkError("ValidationException", "Item size has exceeded the maximum allowed size");
  return error;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`stub: missing ${what}`);
  return value;
}

export class StubSender implements DynamoSender {
  readonly getInputs: GetItemCommandInput[] = [];
  readonly putInputs: PutItemCommandInput[] = [];
  readonly queryInputs: QueryCommandInput[] = [];

  constructor(
    readonly backing: MemoryDynamo = new MemoryDynamo(),
    private readonly pageSize = 2,
  ) {}

  async getItem(input: GetItemCommandInput): Promise<GetItemCommandOutput> {
    this.getInputs.push(input);
    if (input.ConsistentRead !== false) throw new Error("stub: expected ConsistentRead false");
    try {
      const item = await this.backing.getItem(required(input.TableName, "TableName"), toItem(input.Key));
      return item === undefined ? { ...META } : { ...META, Item: toSdk(item) };
    } catch (error) {
      throw translate(error);
    }
  }

  async putItem(input: PutItemCommandInput): Promise<PutItemCommandOutput> {
    this.putInputs.push(input);
    let ifNotExists = false;
    if (input.ConditionExpression !== undefined) {
      if (input.ConditionExpression !== NOT_EXISTS_CONDITION || input.ExpressionAttributeNames?.["#pk"] !== "pk") {
        throw new Error("stub: unexpected condition");
      }
      ifNotExists = true;
    }
    try {
      await this.backing.putItem(required(input.TableName, "TableName"), toItem(input.Item), { ifNotExists });
      return { ...META };
    } catch (error) {
      throw translate(error);
    }
  }

  async query(input: QueryCommandInput): Promise<QueryCommandOutput> {
    this.queryInputs.push(input);
    if (input.ScanIndexForward !== true) throw new Error("stub: expected ScanIndexForward true");
    const names = required(input.ExpressionAttributeNames, "names");
    const values = required(input.ExpressionAttributeValues, "values");
    const partition = { name: required(names["#p"], "#p"), value: required(values[":p"]?.S, ":p") };
    let sortBetween: QueryInput["sortBetween"];
    if (input.KeyConditionExpression === "#p = :p AND #s BETWEEN :lo AND :hi") {
      sortBetween = { name: required(names["#s"], "#s"), low: attr(values[":lo"]), high: attr(values[":hi"]) };
    } else if (input.KeyConditionExpression !== "#p = :p") {
      throw new Error("stub: unexpected key condition");
    }
    let projection: string[] | undefined;
    if (input.ProjectionExpression !== undefined) {
      projection = input.ProjectionExpression.split(", ").map((placeholder) => required(names[placeholder], placeholder));
    }
    let all: readonly Item[];
    try {
      all = await this.backing.query({
        table: required(input.TableName, "TableName"),
        partition,
        ...(input.IndexName !== undefined ? { index: input.IndexName } : {}),
        ...(sortBetween !== undefined ? { sortBetween } : {}),
        ...(projection !== undefined ? { projection } : {}),
      });
    } catch (error) {
      throw translate(error);
    }
    const offset = input.ExclusiveStartKey === undefined ? 0 : Number(required(input.ExclusiveStartKey["offset"]?.N, "offset"));
    const page = all.slice(offset, offset + this.pageSize);
    const next = offset + this.pageSize;
    return {
      ...META,
      Items: page.map(toSdk),
      ...(next < all.length ? { LastEvaluatedKey: { offset: { N: String(next) } } } : {}),
    };
  }
}
