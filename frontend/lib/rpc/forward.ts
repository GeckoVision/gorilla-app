/**
 * Robust JSON-RPC forwarding for the same-origin RPC proxy.
 *
 * Public devnet aggressively 429-rate-limits bursts (a settlement page fires
 * ~15 calls). This module makes every forwarded call resilient:
 *   - retry-with-backoff (jitter + `Retry-After`) on 429 / 5xx / network error,
 *   - a per-attempt timeout via `AbortController`,
 *   - an overall time budget so a call never hangs unbounded,
 *   - a concurrency limiter so we never stampede the upstream ourselves.
 *
 * All effects (fetch, sleep, clock) are injectable so the logic is unit-testable
 * with light fakes — no network, no real timers.
 */

export interface ForwardResult {
  status: number;
  body: string;
  contentType: string;
  attempts: number;
}

export interface ForwardOptions {
  upstream: string;
  body: string;
  method?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Number of retries AFTER the first attempt. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Overall deadline across all attempts. */
  totalBudgetMs?: number;
}

// Statuses worth retrying: too-many-requests, too-early, and transient 5xx.
export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULTS = {
  retries: 3,
  baseDelayMs: 300,
  maxDelayMs: 4000,
  timeoutMs: 8000,
  totalBudgetMs: 15000,
};

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  rand: () => number = Math.random,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  const jitter = rand() * baseDelayMs;
  return Math.min(maxDelayMs, exponential + jitter);
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms, or null. */
export function parseRetryAfter(
  value: string | null,
  nowMs: number,
): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(value);
  if (!Number.isNaN(when)) return Math.max(0, when - nowMs);
  return null;
}

/**
 * Forward a single JSON-RPC request with retries. Never throws — on total
 * failure it resolves with a synthesized JSON-RPC error envelope so the client
 * always receives parseable JSON rather than a transport crash.
 */
export async function forwardRpc(opts: ForwardOptions): Promise<ForwardResult> {
  const {
    upstream,
    body,
    method = "POST",
    headers = { "content-type": "application/json" },
    fetchImpl = fetch,
    sleepImpl = realSleep,
    now = Date.now,
    retries = DEFAULTS.retries,
    baseDelayMs = DEFAULTS.baseDelayMs,
    maxDelayMs = DEFAULTS.maxDelayMs,
    timeoutMs = DEFAULTS.timeoutMs,
    totalBudgetMs = DEFAULTS.totalBudgetMs,
  } = opts;

  const start = now();
  let tries = 0;
  let lastStatus = 0;
  let lastBody = "";
  let lastContentType = "application/json";
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    tries++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response | null = null;
    try {
      res = await fetchImpl(upstream, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    if (res) {
      const text = await res.text().catch(() => "");
      lastStatus = res.status;
      lastBody = text;
      lastContentType = res.headers.get("content-type") ?? "application/json";
      lastError = null;
      if (!RETRYABLE_STATUS.has(res.status)) {
        return { status: res.status, body: text, contentType: lastContentType, attempts: tries };
      }
    }

    if (attempt >= retries) break;

    let delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
    if (res) {
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"), now());
      if (retryAfter !== null) delay = Math.min(Math.max(retryAfter, delay), maxDelayMs * 2);
    }
    if (now() - start + delay > totalBudgetMs) break;
    await sleepImpl(delay);
  }

  if (lastStatus) {
    // A retryable status persisted (e.g. 429) — hand it back; the client's
    // graceful catch turns it into a fallback/empty state.
    return { status: lastStatus, body: lastBody, contentType: lastContentType, attempts: tries };
  }

  const reason = lastError instanceof Error ? lastError.name : "unreachable";
  return {
    status: 504,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: `RPC upstream ${reason}` },
    }),
    contentType: "application/json",
    attempts: tries,
  };
}

/**
 * A concurrency limiter. Caps simultaneous upstream requests so the proxy never
 * stampedes the RPC (the root cause of the 429 storms). FIFO queueing.
 */
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < maxConcurrent) {
        active++;
        resolve();
      } else {
        queue.push(() => {
          active++;
          resolve();
        });
      }
    });

  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}
