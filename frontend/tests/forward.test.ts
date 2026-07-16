import { describe, expect, it, vi } from "vitest";

import {
  backoffDelay,
  createLimiter,
  forwardRpc,
  parseRetryAfter,
  RETRYABLE_STATUS,
} from "@/lib/rpc/forward";

const noSleep = async () => {};

function jsonResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const OK_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "ok" });

describe("forwardRpc — success", () => {
  it("passes a 200 straight through with a single attempt", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, OK_BODY));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe(OK_BODY);
    expect(res.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a non-retryable 4xx (e.g. 400)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, "{}"));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(res.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("forwardRpc — retry on 429 / 5xx", () => {
  it("retries a 429 and returns the eventual 200", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, "rate limited"))
      .mockResolvedValueOnce(jsonResponse(429, "rate limited"))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
      retries: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe(OK_BODY);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries a transient 503 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, "unavailable"))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after `retries` and returns the last 429 (client catches → fallback)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, "still limited"));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
      retries: 2,
    });
    expect(res.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("honours a Retry-After header (parsed, capped) without crashing", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, "wait", { "retry-after": "1" }))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      baseDelayMs: 100,
      maxDelayMs: 4000,
    });
    expect(res.status).toBe(200);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000); // waited ~1s per Retry-After
  });
});

describe("forwardRpc — network failure / timeout", () => {
  it("retries a rejecting fetch, then synthesizes a 504 JSON envelope", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
      retries: 2,
    });
    expect(res.status).toBe(504);
    expect(() => JSON.parse(res.body)).not.toThrow();
    expect(JSON.parse(res.body).error).toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("aborts a hanging request via the per-attempt timeout and recovers", async () => {
    // First attempt hangs until aborted; second resolves.
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      )
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
      timeoutMs: 10,
    });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never throws even when every attempt fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("dns");
    });
    await expect(
      forwardRpc({
        upstream: "https://rpc",
        body: "{}",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleepImpl: noSleep,
        retries: 1,
      }),
    ).resolves.toMatchObject({ status: 504 });
  });
});

describe("forwardRpc — total budget", () => {
  it("stops retrying once the time budget would be exceeded", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(429, "limited"));
    const res = await forwardRpc({
      upstream: "https://rpc",
      body: "{}",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      retries: 10,
      baseDelayMs: 500,
      totalBudgetMs: 1200,
    });
    expect(res.status).toBe(429);
    // budget stops it well before 11 attempts
    expect(fetchImpl.mock.calls.length).toBeLessThan(6);
  });
});

describe("backoff + retry-after helpers", () => {
  it("backoffDelay grows exponentially and is capped", () => {
    const rand = () => 0; // no jitter
    expect(backoffDelay(0, 100, 4000, rand)).toBe(100);
    expect(backoffDelay(1, 100, 4000, rand)).toBe(200);
    expect(backoffDelay(2, 100, 4000, rand)).toBe(400);
    expect(backoffDelay(10, 100, 4000, rand)).toBe(4000); // capped
  });

  it("parseRetryAfter handles delta-seconds, dates, and junk", () => {
    expect(parseRetryAfter("2", 0)).toBe(2000);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("not-a-date", 0)).toBeNull();
    const future = new Date(10_000).toUTCString();
    expect(parseRetryAfter(future, 0)).toBeGreaterThanOrEqual(0);
  });

  it("429 and 5xx are retryable; 200/400/404 are not", () => {
    expect(RETRYABLE_STATUS.has(429)).toBe(true);
    expect(RETRYABLE_STATUS.has(503)).toBe(true);
    expect(RETRYABLE_STATUS.has(200)).toBe(false);
    expect(RETRYABLE_STATUS.has(400)).toBe(false);
    expect(RETRYABLE_STATUS.has(404)).toBe(false);
  });
});

describe("createLimiter — concurrency cap", () => {
  it("never runs more than `max` tasks at once", async () => {
    const limit = createLimiter(3);
    let running = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      });
    await Promise.all(Array.from({ length: 12 }, task));
    expect(peak).toBeLessThanOrEqual(3);
    expect(running).toBe(0);
  });

  it("still releases a slot when a task rejects", async () => {
    const limit = createLimiter(1);
    await expect(
      limit(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // the slot is free again — the next task runs
    await expect(limit(async () => "ok")).resolves.toBe("ok");
  });
});
