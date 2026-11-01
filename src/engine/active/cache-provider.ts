import type { ICacheProvider } from "../contracts/cache";

interface CacheEntry {
  value: unknown;
  expiresAt: number | null;
}

export class MemoryCacheProvider implements ICacheProvider {
  readonly id = "memory";
  private store = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val !== null;
  }

  async flush(): Promise<void> {
    this.store.clear();
  }
}

export const activeCacheProvider: ICacheProvider = new MemoryCacheProvider();

