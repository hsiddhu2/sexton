// DynamoDB CacheStore. Spec: .kiro/specs/infra, Requirements 2.1 to 2.7.
// get and set never reject: CachedFetcher awaits set inside the fetch, so a failing set would fail the fetch.
// No log line carries the key or the value.

import type { CacheEntry, CacheStore } from "@sexton/engine";
import { errorName, type Logger } from "../log/logger.js";
import { CACHE_TTL_SECONDS, cacheKeyItem, decodeCacheItem, encodeCacheItem } from "./cache-item.js";
import type { DynamoPort } from "./port.js";

export class DynamoCacheStore implements CacheStore {
  constructor(
    private readonly port: DynamoPort,
    private readonly table: string,
    private readonly log: Logger,
    private readonly ttlSeconds: number = CACHE_TTL_SECONDS,
  ) {}

  async get(key: string): Promise<CacheEntry<unknown> | undefined> {
    try {
      const item = await this.port.getItem(this.table, cacheKeyItem(key));
      if (item === undefined) return undefined;
      const entry = decodeCacheItem(item);
      if (entry === undefined) this.log.warn({ msg: "cache-decode-failed" });
      return entry;
    } catch (error) {
      this.log.warn({ msg: "cache-get-failed", errorName: errorName(error) });
      return undefined;
    }
  }

  async set(key: string, entry: CacheEntry<unknown>): Promise<void> {
    try {
      const encoded = encodeCacheItem(key, entry, this.ttlSeconds);
      if (!encoded.ok) {
        this.log.info({ msg: "cache-skip", reason: encoded.reason, bytes: encoded.bytes });
        return;
      }
      await this.port.putItem(this.table, encoded.item);
    } catch (error) {
      this.log.warn({ msg: "cache-set-failed", errorName: errorName(error) });
    }
  }
}
