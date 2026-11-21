// The same DynamoPort suite against the in-memory fake and against AwsDynamoPort over a stubbed sender.
// Spec: .kiro/specs/infra, task 2.4. No network.

import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { describe, expect, it } from "vitest";
import { AwsDynamoPort, MAX_QUERY_PAGES, sdkSender, type DynamoSender } from "../../src/dynamo/aws-port.js";
import { ConditionFailedError, ItemTooLargeError, type DynamoPort, type Item } from "../../src/dynamo/port.js";
import { CACHE_TABLE, MAX_ITEM_BYTES, MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } from "../fakes/memory-dynamo.js";
import { StubSender } from "../fakes/sdk-stub.js";

const ports: readonly (readonly [string, () => DynamoPort])[] = [
  ["memory fake", () => new MemoryDynamo()],
  ["AwsDynamoPort over a stubbed sender", () => new AwsDynamoPort(new StubSender())],
];

function snap(name: string, sk: string, data = "{}"): Item {
  return { pk: { S: `snap#${name}` }, sk: { S: sk }, data: { S: data } };
}

function seen(name: string, sk: string, seenAt: number): Item {
  return { pk: { S: `seen#${name}` }, sk: { S: sk }, gpk: { S: "seen" }, seenAt: { N: String(seenAt) }, name: { S: name } };
}

describe.each(ports)("DynamoPort contract: %s", (_label, make) => {
  it("returns undefined for a missing item and the stored item after a put", async () => {
    const port = make();
    expect(await port.getItem(CACHE_TABLE, { pk: { S: "k" } })).toBeUndefined();
    const item: Item = { pk: { S: "k" }, v: { B: new Uint8Array([1, 2, 3]) }, storedAt: { N: "5" } };
    await port.putItem(CACHE_TABLE, item);
    expect(await port.getItem(CACHE_TABLE, { pk: { S: "k" } })).toEqual(item);
  });

  it("replaces an item on an unconditional put", async () => {
    const port = make();
    await port.putItem(CACHE_TABLE, { pk: { S: "k" }, storedAt: { N: "1" } });
    await port.putItem(CACHE_TABLE, { pk: { S: "k" }, storedAt: { N: "2" } });
    expect(await port.getItem(CACHE_TABLE, { pk: { S: "k" } })).toEqual({ pk: { S: "k" }, storedAt: { N: "2" } });
  });

  it("rejects a conditional put on an existing key with ConditionFailedError and keeps the first item", async () => {
    const port = make();
    await port.putItem(SNAPSHOTS_TABLE, snap("a", "1#x", "first"), { ifNotExists: true });
    await expect(port.putItem(SNAPSHOTS_TABLE, snap("a", "1#x", "second"), { ifNotExists: true })).rejects.toBeInstanceOf(ConditionFailedError);
    expect(await port.query({ table: SNAPSHOTS_TABLE, partition: { name: "pk", value: "snap#a" } })).toEqual([snap("a", "1#x", "first")]);
  });

  it("allows a conditional put on a new sort key in the same partition", async () => {
    const port = make();
    await port.putItem(SNAPSHOTS_TABLE, snap("a", "1#x"), { ifNotExists: true });
    await port.putItem(SNAPSHOTS_TABLE, snap("a", "1#y"), { ifNotExists: true });
    expect(await port.query({ table: SNAPSHOTS_TABLE, partition: { name: "pk", value: "snap#a" } })).toHaveLength(2);
  });

  it("rejects an item over 400 KB with ItemTooLargeError", async () => {
    const port = make();
    const item: Item = { pk: { S: "big" }, v: { B: new Uint8Array(MAX_ITEM_BYTES + 1) } };
    await expect(port.putItem(CACHE_TABLE, item)).rejects.toBeInstanceOf(ItemTooLargeError);
    expect(await port.getItem(CACHE_TABLE, { pk: { S: "big" } })).toBeUndefined();
  });

  it("queries one partition, ascending by sort key (the stub returns it in pages of two)", async () => {
    const port = make();
    for (const sk of ["3#c", "1#a", "5#e", "2#b", "4#d"]) await port.putItem(SNAPSHOTS_TABLE, snap("a", sk));
    await port.putItem(SNAPSHOTS_TABLE, snap("b", "0#z"));
    const items = await port.query({ table: SNAPSHOTS_TABLE, partition: { name: "pk", value: "snap#a" } });
    expect(items.map((i) => i["sk"])).toEqual(["1#a", "2#b", "3#c", "4#d", "5#e"].map((S) => ({ S })));
  });

  it("queries the sparse GSI with inclusive numeric bounds and a projection", async () => {
    const port = make();
    await port.putItem(SNAPSHOTS_TABLE, seen("x", "1#a", 100));
    await port.putItem(SNAPSHOTS_TABLE, seen("y", "1#a", 200));
    await port.putItem(SNAPSHOTS_TABLE, seen("z", "1#a", 300));
    await port.putItem(SNAPSHOTS_TABLE, seen("w", "1#a", 99));
    await port.putItem(SNAPSHOTS_TABLE, snap("x", "1#a")); // no gpk: not in the index
    const items = await port.query({
      table: SNAPSHOTS_TABLE,
      index: SEEN_INDEX,
      partition: { name: "gpk", value: "seen" },
      sortBetween: { name: "seenAt", low: { N: "100" }, high: { N: "300" } },
      projection: ["name"],
    });
    expect(items).toEqual([{ name: { S: "x" } }, { name: { S: "y" } }, { name: { S: "z" } }]);
  });

  it("orders Number sort keys numerically, not as text", async () => {
    const port = make();
    await port.putItem(SNAPSHOTS_TABLE, seen("ten", "1#a", 10));
    await port.putItem(SNAPSHOTS_TABLE, seen("nine", "1#a", 9));
    const items = await port.query({ table: SNAPSHOTS_TABLE, index: SEEN_INDEX, partition: { name: "gpk", value: "seen" }, projection: ["name"] });
    expect(items).toEqual([{ name: { S: "nine" } }, { name: { S: "ten" } }]);
  });
});

describe("AwsDynamoPort mapping", () => {
  it("sends an eventually consistent GetItem", async () => {
    const stub = new StubSender();
    await new AwsDynamoPort(stub).getItem(CACHE_TABLE, { pk: { S: "k" } });
    expect(stub.getInputs).toEqual([{ TableName: CACHE_TABLE, Key: { pk: { S: "k" } }, ConsistentRead: false }]);
  });

  it("adds the not-exists condition only when asked", async () => {
    const stub = new StubSender();
    const port = new AwsDynamoPort(stub);
    await port.putItem(CACHE_TABLE, { pk: { S: "a" } });
    await port.putItem(SNAPSHOTS_TABLE, snap("a", "1#x"), { ifNotExists: true });
    expect(stub.putInputs[0]).toEqual({ TableName: CACHE_TABLE, Item: { pk: { S: "a" } } });
    expect(stub.putInputs[1]?.ConditionExpression).toBe("attribute_not_exists(#pk)");
    expect(stub.putInputs[1]?.ExpressionAttributeNames).toEqual({ "#pk": "pk" });
  });

  it("follows LastEvaluatedKey from recorded outputs and stops when it is absent", async () => {
    const outputs = [
      { $metadata: {}, Items: [{ pk: { S: "snap#a" }, sk: { S: "1" } }], LastEvaluatedKey: { pk: { S: "snap#a" }, sk: { S: "1" } } },
      { $metadata: {}, Items: [{ pk: { S: "snap#a" }, sk: { S: "2" } }] },
    ];
    const seenStarts: unknown[] = [];
    const sender: DynamoSender = {
      getItem: () => Promise.reject(new Error("unused")),
      putItem: () => Promise.reject(new Error("unused")),
      query: (input) => {
        seenStarts.push(input.ExclusiveStartKey);
        const next = outputs.shift();
        return next === undefined ? Promise.reject(new Error("too many pages")) : Promise.resolve(next);
      },
    };
    const items = await new AwsDynamoPort(sender).query({ table: SNAPSHOTS_TABLE, partition: { name: "pk", value: "snap#a" } });
    expect(items).toEqual([
      { pk: { S: "snap#a" }, sk: { S: "1" } },
      { pk: { S: "snap#a" }, sk: { S: "2" } },
    ]);
    expect(seenStarts).toEqual([undefined, { pk: { S: "snap#a" }, sk: { S: "1" } }]);
  });

  it("stops a query that never ends after the page limit", async () => {
    let calls = 0;
    const sender: DynamoSender = {
      getItem: () => Promise.reject(new Error("unused")),
      putItem: () => Promise.reject(new Error("unused")),
      query: () => {
        calls += 1;
        return Promise.resolve({ $metadata: {}, Items: [], LastEvaluatedKey: { pk: { S: "x" } } });
      },
    };
    await expect(new AwsDynamoPort(sender).query({ table: SNAPSHOTS_TABLE, partition: { name: "pk", value: "x" } })).rejects.toThrow(/page limit/);
    expect(calls).toBe(MAX_QUERY_PAGES);
  });

  it("maps ConditionalCheckFailedException and an item-size ValidationException, and rethrows others unchanged", async () => {
    const fail = (name: string, message: string): DynamoSender => {
      const error = Object.assign(new Error(message), { name });
      return { getItem: () => Promise.reject(error), putItem: () => Promise.reject(error), query: () => Promise.reject(error) };
    };
    await expect(new AwsDynamoPort(fail("ConditionalCheckFailedException", "x")).putItem(CACHE_TABLE, { pk: { S: "a" } })).rejects.toBeInstanceOf(ConditionFailedError);
    await expect(
      new AwsDynamoPort(fail("ValidationException", "Item size has exceeded the maximum allowed size")).putItem(CACHE_TABLE, { pk: { S: "a" } }),
    ).rejects.toBeInstanceOf(ItemTooLargeError);
    const other = new AwsDynamoPort(fail("ProvisionedThroughputExceededException", "slow down"));
    await expect(other.getItem(CACHE_TABLE, { pk: { S: "a" } })).rejects.toMatchObject({ name: "ProvisionedThroughputExceededException" });
    await expect(other.query({ table: CACHE_TABLE, partition: { name: "pk", value: "a" } })).rejects.toMatchObject({ name: "ProvisionedThroughputExceededException" });
    const plain = new AwsDynamoPort(fail("ValidationException", "One or more parameter values were invalid"));
    await expect(plain.putItem(CACHE_TABLE, { pk: { S: "a" } })).rejects.toMatchObject({ name: "ValidationException" });
  });

  it("drops attribute types no Sexton item writes", async () => {
    const sender: DynamoSender = {
      getItem: () => Promise.resolve({ $metadata: {}, Item: { pk: { S: "a" }, flag: { BOOL: true }, n: { N: "1" } } }),
      putItem: () => Promise.reject(new Error("unused")),
      query: () => Promise.reject(new Error("unused")),
    };
    expect(await new AwsDynamoPort(sender).getItem(CACHE_TABLE, { pk: { S: "a" } })).toEqual({ pk: { S: "a" }, n: { N: "1" } });
  });

  it("sdkSender sends the three SDK command classes", async () => {
    const sent: unknown[] = [];
    const client = {
      send: (command: unknown) => {
        sent.push(command);
        return Promise.resolve({ $metadata: {} });
      },
    } as unknown as DynamoDBClient;
    const sender = sdkSender(client);
    await sender.getItem({ TableName: "t", Key: {} });
    await sender.putItem({ TableName: "t", Item: {} });
    await sender.query({ TableName: "t" });
    expect(sent[0]).toBeInstanceOf(GetItemCommand);
    expect(sent[1]).toBeInstanceOf(PutItemCommand);
    expect(sent[2]).toBeInstanceOf(QueryCommand);
  });
});
