/**
 * In-flight request coalescing + a short TTL cache for idempotent RPC reads.
 *
 * Public devnet 429s under bursts. A single app load fires many identical reads
 * (e.g. several components each want the same `getProgramAccounts` scan), and
 * web3.js increments the JSON-RPC `id` per call — so the cache key must be built
 * from `method` + `params`, IGNORING `id`, or nothing would ever coalesce.
 *
 * Coalescing turns N concurrent identical scans into ONE upstream call; the TTL
 * cache turns repeated loads within a few seconds into cache hits. Writes
 * (`sendTransaction`, `simulateTransaction`) and volatile reads
 * (`getSignatureStatuses`) are deliberately NOT cacheable — they pass straight
 * through.
 */

// Idempotent reads that are safe to coalesce + briefly cache.
export const CACHEABLE_METHODS = new Set<string>([
  "getProgramAccounts",
  "getAccountInfo",
  "getMultipleAccounts",
  "getSignaturesForAddress",
  "getParsedTransaction",
  "getTransaction",
  "getBalance",
  "getLatestBlockhash",
]);

export function isCacheable(method: string | null): boolean {
  return method !== null && CACHEABLE_METHODS.has(method);
}

/** A stable cache key from `method` + `params` (NOT `id`), or null for
 * unparseable / batch requests (which are never cached). */
export function rpcCacheKey(
  mode: string,
  body: string,
): { key: string; method: string } | null {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) || typeof parsed?.method !== "string") return null;
    return {
      key: `${mode}:${parsed.method}:${JSON.stringify(parsed.params ?? null)}`,
      method: parsed.method,
    };
  } catch {
    return null;
  }
}

export interface RpcCacheOptions {
  ttlMs?: number;
  now?: () => number;
}

export function createRpcCache<T extends { status: number }>({
  ttlMs = 8000,
  now = Date.now,
}: RpcCacheOptions = {}) {
  const store = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();

  return {
    /** Return a cached value, join an in-flight identical call, or run + cache. */
    async run(key: string, producer: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;

      const existing = inflight.get(key);
      if (existing) return existing;

      const pending = (async () => {
        const value = await producer();
        // Only cache good responses — never memoize a 429/504.
        if (value.status === 200) {
          store.set(key, { value, expiresAt: now() + ttlMs });
        }
        return value;
      })();

      inflight.set(key, pending);
      try {
        return await pending;
      } finally {
        inflight.delete(key);
      }
    },
    size() {
      return store.size;
    },
  };
}
