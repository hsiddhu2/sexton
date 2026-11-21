// In-memory DynamoPort fake. Models the key schema of both Sexton tables, the sparse GSI, ascending sort-key
// order, the conditional put and the 400 KB item limit. Failures and result order can be injected. No network.

import { ConditionFailedError, ItemTooLargeError, isN, isS, type AttrValue, type DynamoPort, type Item, type PutOptions, type QueryInput } from "../../src/dynamo/port.js";

export const MAX_ITEM_BYTES = 400 * 1024;

type KeyType = "S" | "N";

export interface IndexSchema {
  readonly partitionKey: string;
  readonly sortKey: string;
  readonly sortType: KeyType;
  /** Non-key attributes copied into the index. */
  readonly projected: readonly string[];
}

export interface TableSchema {
  readonly partitionKey: string;
  readonly sortKey?: string;
  readonly indexes?: Readonly<Record<string, IndexSchema>>;
}

export const CACHE_TABLE = "sexton-cache-test";
export const SNAPSHOTS_TABLE = "sexton-snapshots-test";
export const SEEN_INDEX = "seen-by-time";

export const SEXTON_TABLES: Readonly<Record<string, TableSchema>> = {
  [CACHE_TABLE]: { partitionKey: "pk" },
  [SNAPSHOTS_TABLE]: {
    partitionKey: "pk",
    sortKey: "sk",
    indexes: { [SEEN_INDEX]: { partitionKey: "gpk", sortKey: "seenAt", sortType: "N", projected: ["name"] } },
  },
};

export type Operation = "getItem" | "putItem" | "query";

export interface MemoryDynamoOptions {
  /** Called before every operation. A returned value is thrown; a returned promise that rejects is awaited. */
  readonly fail?: (operation: Operation) => unknown;
  /** Reorders query results before they are returned. Used to prove that stores sort by themselves. */
  readonly reorder?: (items: Item[]) => Item[];
}

export interface PortCall {
  readonly operation: Operation;
  readonly table: string;
}

function copyValue(value: AttrValue): AttrValue {
  if ("S" in value) return { S: value.S };
  if ("N" in value) return { N: value.N };
  return { B: new Uint8Array(value.B) };
}

function copyItem(item: Item): Item {
  const out: Record<string, AttrValue> = {};
  for (const [name, value] of Object.entries(item)) out[name] = copyValue(value);
  return out;
}

/** Approximate DynamoDB item size: attribute names plus values in bytes. Numbers count one byte per character. */
export function itemBytes(item: Item): number {
  const encoder = new TextEncoder();
  let total = 0;
  for (const [name, value] of Object.entries(item)) {
    total += encoder.encode(name).byteLength;
    if ("S" in value) total += encoder.encode(value.S).byteLength;
    else if ("N" in value) total += value.N.length;
    else total += value.B.byteLength;
  }
  return total;
}

function compareKey(a: AttrValue | undefined, b: AttrValue | undefined, type: KeyType): number {
  if (type === "N") {
    const x = isN(a) ? Number(a.N) : Number.NaN;
    const y = isN(b) ? Number(b.N) : Number.NaN;
    return x - y;
  }
  // DynamoDB orders String keys by their UTF-8 bytes.
  return Buffer.compare(Buffer.from(isS(a) ? a.S : "", "utf8"), Buffer.from(isS(b) ? b.S : "", "utf8"));
}

function keyString(item: Item, schema: TableSchema): string {
  const pk = item[schema.partitionKey];
  if (!isS(pk)) throw new Error(`fake: missing string partition key ${schema.partitionKey}`);
  if (schema.sortKey === undefined) return JSON.stringify([pk.S]);
  const sk = item[schema.sortKey];
  if (!isS(sk)) throw new Error(`fake: missing string sort key ${schema.sortKey}`);
  return JSON.stringify([pk.S, sk.S]);
}

export class MemoryDynamo implements DynamoPort {
  private readonly tables = new Map<string, Map<string, Item>>();
  readonly calls: PortCall[] = [];
  /** Every successful put, in order, as written. */
  readonly writes: { readonly table: string; readonly item: Item }[] = [];

  constructor(
    private readonly schemas: Readonly<Record<string, TableSchema>> = SEXTON_TABLES,
    private readonly options: MemoryDynamoOptions = {},
  ) {}

  private schema(table: string): TableSchema {
    const schema = Object.hasOwn(this.schemas, table) ? this.schemas[table] : undefined;
    if (schema === undefined) throw new Error(`fake: unknown table ${table}`);
    return schema;
  }

  private rows(table: string): Map<string, Item> {
    let rows = this.tables.get(table);
    if (rows === undefined) {
      rows = new Map();
      this.tables.set(table, rows);
    }
    return rows;
  }

  private async enter(operation: Operation, table: string): Promise<void> {
    this.calls.push({ operation, table });
    const failure = this.options.fail?.(operation);
    if (failure === undefined) return;
    if (failure instanceof Promise) {
      await failure;
      return;
    }
    throw failure;
  }

  async getItem(table: string, key: Item): Promise<Item | undefined> {
    await this.enter("getItem", table);
    const item = this.rows(table).get(keyString(key, this.schema(table)));
    return item === undefined ? undefined : copyItem(item);
  }

  async putItem(table: string, item: Item, options: PutOptions = {}): Promise<void> {
    await this.enter("putItem", table);
    const schema = this.schema(table);
    if (itemBytes(item) > MAX_ITEM_BYTES) throw new ItemTooLargeError();
    const rows = this.rows(table);
    const key = keyString(item, schema);
    if (options.ifNotExists === true && rows.has(key)) throw new ConditionFailedError();
    const copy = copyItem(item);
    rows.set(key, copy);
    this.writes.push({ table, item: copyItem(copy) });
  }

  async query(input: QueryInput): Promise<readonly Item[]> {
    await this.enter("query", input.table);
    const schema = this.schema(input.table);
    const index = input.index === undefined ? undefined : schema.indexes?.[input.index];
    if (input.index !== undefined && index === undefined) throw new Error(`fake: unknown index ${input.index}`);
    const partitionKey = index?.partitionKey ?? schema.partitionKey;
    const sortKey = index?.sortKey ?? schema.sortKey;
    const sortType: KeyType = index?.sortType ?? "S";
    if (input.partition.name !== partitionKey) throw new Error("fake: partition name is not the key");
    if (input.sortBetween !== undefined && input.sortBetween.name !== sortKey) throw new Error("fake: sort name is not the key");

    let matches = [...this.rows(input.table).values()].filter((item) => {
      const pk = item[partitionKey];
      if (!isS(pk) || pk.S !== input.partition.value) return false;
      // Sparse index: an item without the index sort key is not in the index.
      if (index !== undefined && item[index.sortKey] === undefined) return false;
      if (input.sortBetween !== undefined && sortKey !== undefined) {
        const value = item[sortKey];
        return compareKey(value, input.sortBetween.low, sortType) >= 0 && compareKey(value, input.sortBetween.high, sortType) <= 0;
      }
      return true;
    });
    if (sortKey !== undefined) matches.sort((a, b) => compareKey(a[sortKey], b[sortKey], sortType));

    if (index !== undefined) {
      const keep = new Set([index.partitionKey, index.sortKey, schema.partitionKey, ...(schema.sortKey !== undefined ? [schema.sortKey] : []), ...index.projected]);
      matches = matches.map((item) => Object.fromEntries(Object.entries(item).filter(([name]) => keep.has(name))));
    }
    if (input.projection !== undefined && input.projection.length > 0) {
      const keep = new Set(input.projection);
      matches = matches.map((item) => Object.fromEntries(Object.entries(item).filter(([name]) => keep.has(name))));
    }
    const copies = matches.map(copyItem);
    return this.options.reorder === undefined ? copies : this.options.reorder(copies);
  }

  /** Every stored item of a table, for assertions. */
  items(table: string): readonly Item[] {
    return [...this.rows(table).values()].map(copyItem);
  }
}
