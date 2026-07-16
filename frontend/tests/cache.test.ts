import { describe, expect, it, vi } from "vitest";

import {
  createRpcCache,
  isCacheable,
  rpcCacheKey,
} from "@/lib/rpc/cache";

const gpa = (id: number) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "getProgramAccounts", params: ["PROG", { x: 1 }] });

describe("rpcCacheKey — id-insensitive", () => {
  it("produces the SAME key for identical method+params but different id", () => {
    const a = rpcCacheKey("devnet", gpa(1));
    const b = rpcCacheKey("devnet", gpa(9999));
    expect(a).not.toBeNull();
    expect(a!.key).toBe(b!.key);
    expect(a!.method).toBe("getProgramAccounts");
  });

  it("differs by params and by mode", () => {
    const a = rpcCacheKey("devnet", gpa(1));
    const b = rpcCacheKey(
      "devnet",
      JSON.stringify({ id: 1, method: "getProgramAccounts", params: ["PROG", { x: 2 }] }),
    );
    const c = rpcCacheKey("mainnet-sim", gpa(1));
    expect(a!.key).not.toBe(b!.key);
    expect(a!.key).not.toBe(c!.key);
  });

  it("returns null for batch arrays and junk", () => {
    expect(rpcCacheKey("devnet", "[]")).toBeNull();
    expect(rpcCacheKey("devnet", "not json")).toBeNull();
    expect(rpcCacheKey("devnet", JSON.stringify({ id: 1 }))).toBeNull();
  });
});

describe("isCacheable", () => {
  it("allows idempotent reads, blocks writes + volatile reads", () => {
    expect(isCacheable("getProgramAccounts")).toBe(true);
    expect(isCacheable("getAccountInfo")).toBe(true);
    expect(isCacheable("sendTransaction")).toBe(false);
    expect(isCacheable("simulateTransaction")).toBe(false);
    expect(isCacheable("getSignatureStatuses")).toBe(false);
    expect(isCacheable(null)).toBe(false);
  });
});

describe("createRpcCache — coalescing + TTL", () => {
  it("coalesces concurrent identical calls into ONE producer invocation", async () => {
    const cache = createRpcCache<{ status: number; body: string }>();
    let calls = 0;
    const producer = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { status: 200, body: "result" };
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.run("k", producer)),
    );
    expect(calls).toBe(1); // 20 concurrent → 1 upstream call
    expect(results.every((r) => r.body === "result")).toBe(true);
  });

  it("serves a cached 200 within the TTL without re-calling", async () => {
    let now = 0;
    const cache = createRpcCache<{ status: number }>({ ttlMs: 1000, now: () => now });
    const producer = vi.fn(async () => ({ status: 200 }));
    await cache.run("k", producer);
    now = 500;
    await cache.run("k", producer);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("re-calls after the TTL expires", async () => {
    let now = 0;
    const cache = createRpcCache<{ status: number }>({ ttlMs: 1000, now: () => now });
    const producer = vi.fn(async () => ({ status: 200 }));
    await cache.run("k", producer);
    now = 1500;
    await cache.run("k", producer);
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("never caches a non-200 (e.g. a 429)", async () => {
    const cache = createRpcCache<{ status: number }>({ ttlMs: 10_000 });
    const producer = vi.fn(async () => ({ status: 429 }));
    await cache.run("k", producer);
    await cache.run("k", producer);
    expect(producer).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(0);
  });
});
