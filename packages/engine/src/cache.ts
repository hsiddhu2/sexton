// Response cache. Requirement 7. Interface plus an in-memory implementation.
// A DynamoDB implementation lives in packages/api in a later spec.

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type Clock = () => Date;

export interface CacheEntry<T> {
  readonly value: T;
  readonly storedAt: number;
}

/** Storage contract. Implementations do not apply TTL, the CachedFetcher does. */
export interface CacheStore {
  get(key: string): Promise<CacheEntry<unknown> | undefined>;
  set(key: string, entry: CacheEntry<unknown>): Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get(key: string): Promise<CacheEntry<unknown> | undefined> {
    return Promise.resolve(this.entries.get(key));
  }

  set(key: string, entry: CacheEntry<unknown>): Promise<void> {
    this.entries.set(key, entry);
    return Promise.resolve();
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Cache key: source, package, version. Requirement 7.1. */
export function cacheKey(source: string, pkg: string, version: string): string {
  return `${source}|${pkg}|${version}`;
}

export interface CachedFetcherOptions {
  readonly store: CacheStore;
  readonly clock: Clock;
  readonly ttlMs?: number;
}

/**
 * Serves values from the store within the TTL, shares in-flight fetches for the same key,
 * and never stores a failed fetch. Requirement 7.2 to 7.5.
 */
export class CachedFetcher {
  private readonly store: CacheStore;
  private readonly clock: Clock;
  private readonly ttlMs: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: CachedFetcherOptions) {
    this.store = options.store;
    this.clock = options.clock;
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async get<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const now = this.clock().getTime();
    const hit = await this.store.get(key);
    if (hit !== undefined && now - hit.storedAt < this.ttlMs) {
      return hit.value as T;
    }
    const pending = this.inFlight.get(key);
    if (pending !== undefined) {
      return pending as Promise<T>;
    }
    const run = (async () => {
      try {
        const value = await fetch();
        await this.store.set(key, { value, storedAt: this.clock().getTime() });
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, run);
    return run;
  }
}
