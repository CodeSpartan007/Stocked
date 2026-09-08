/**
 * Client-Side In-Memory Cache with Stale-While-Revalidate pattern.
 * Enables instant page loads across navigation (Dashboard, Stocks, Transactions)
 * without flickering loading spinners or redundant network waterfalls.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

/**
 * Retrieve cached data if still within fresh threshold (default: 2 minutes).
 */
export function getCached<T>(key: string, maxAgeMs = 2 * 60 * 1000): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > maxAgeMs) {
    return null;
  }
  return item.data as T;
}

/**
 * Save data into in-memory client cache with current timestamp.
 */
export function setCached<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate cache entries by key prefix or clear entire cache.
 */
export function clearCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
  } else {
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }
  }
}
