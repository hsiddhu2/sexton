// The narrow DynamoDB port the stores talk to. Spec: .kiro/specs/infra, Requirements 2.1, 3.1, 3.6.
// Three methods only, so tests can run every store against an in-memory fake.

export type AttrValue = { readonly S: string } | { readonly N: string } | { readonly B: Uint8Array };
export type Item = Readonly<Record<string, AttrValue>>;

export interface PutOptions {
  /** Adds the condition attribute_not_exists(pk). */
  readonly ifNotExists?: boolean;
}

export interface QueryInput {
  readonly table: string;
  readonly index?: string;
  readonly partition: { readonly name: string; readonly value: string };
  /** Inclusive on both ends. */
  readonly sortBetween?: { readonly name: string; readonly low: AttrValue; readonly high: AttrValue };
  readonly projection?: readonly string[];
}

/** The put condition failed: an item with the same key exists. */
export class ConditionFailedError extends Error {
  constructor() {
    super("conditional check failed");
    this.name = "ConditionFailedError";
  }
}

/** The item is larger than DynamoDB allows. */
export class ItemTooLargeError extends Error {
  constructor() {
    super("item too large");
    this.name = "ItemTooLargeError";
  }
}

export interface DynamoPort {
  /** Eventually consistent read. */
  getItem(table: string, key: Item): Promise<Item | undefined>;
  putItem(table: string, item: Item, options?: PutOptions): Promise<void>;
  /** Returns every page, ascending by sort key. */
  query(input: QueryInput): Promise<readonly Item[]>;
}

export function isS(value: AttrValue | undefined): value is { readonly S: string } {
  return value !== undefined && "S" in value && typeof value.S === "string";
}

export function isN(value: AttrValue | undefined): value is { readonly N: string } {
  return value !== undefined && "N" in value && typeof value.N === "string";
}

export function isB(value: AttrValue | undefined): value is { readonly B: Uint8Array } {
  return value !== undefined && "B" in value && value.B instanceof Uint8Array;
}
