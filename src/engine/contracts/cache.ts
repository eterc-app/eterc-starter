export interface ICacheProvider {
  readonly id: string;

  /** Retrieves a parsed value from cache, or null if missed/expired. */
  get<T>(key: string): Promise<T | null>;

  /** Stores a value in the cache with an optional TTL in seconds. */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /** Deletes an entry from cache. */
  delete(key: string): Promise<boolean>;

  /** Checks if a key exists in cache. */
  has(key: string): Promise<boolean>;

  /** Flushes all stored cache entries. */
  flush(): Promise<void>;
}

