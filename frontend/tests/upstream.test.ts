import { describe, expect, it } from "vitest";

import {
  isPublicFallback,
  maxConcurrency,
  PUBLIC_DEVNET,
  resolveUpstream,
} from "@/lib/rpc/upstream";

describe("resolveUpstream — Helius-first, SSRF-safe", () => {
  it("prefers an explicit DEVNET_RPC_URL", () => {
    expect(resolveUpstream("devnet", { DEVNET_RPC_URL: "https://my-rpc" })).toBe(
      "https://my-rpc",
    );
  });

  it("builds the Helius devnet URL from a key when no explicit URL", () => {
    expect(resolveUpstream("devnet", { HELIUS_API_KEY: "KEY123" })).toBe(
      "https://devnet.helius-rpc.com/?api-key=KEY123",
    );
  });

  it("prefers DEVNET_RPC_URL over a Helius key", () => {
    expect(
      resolveUpstream("devnet", {
        DEVNET_RPC_URL: "https://explicit",
        HELIUS_API_KEY: "KEY",
      }),
    ).toBe("https://explicit");
  });

  it("falls back to public devnet with no config", () => {
    const upstream = resolveUpstream("devnet", {});
    expect(upstream).toBe(PUBLIC_DEVNET);
    expect(isPublicFallback(upstream ?? "")).toBe(true);
  });

  it("returns null for mainnet-sim unless configured (→ 501 seam)", () => {
    expect(resolveUpstream("mainnet-sim", {})).toBeNull();
    expect(
      resolveUpstream("mainnet-sim", { MAINNET_SIM_RPC_URL: "https://fork" }),
    ).toBe("https://fork");
  });

  it("never derives the upstream from request input (fixed by mode)", () => {
    // Only the two known modes resolve; there is no request-controlled branch.
    expect(resolveUpstream("devnet", {})).toBe(PUBLIC_DEVNET);
    expect(resolveUpstream("mainnet-sim", {})).toBeNull();
  });
});

describe("maxConcurrency", () => {
  it("defaults to 6", () => {
    expect(maxConcurrency({})).toBe(6);
  });

  it("reads a positive integer from env", () => {
    expect(maxConcurrency({ RPC_MAX_CONCURRENCY: "3" })).toBe(3);
  });

  it("ignores junk / non-positive values", () => {
    expect(maxConcurrency({ RPC_MAX_CONCURRENCY: "nope" })).toBe(6);
    expect(maxConcurrency({ RPC_MAX_CONCURRENCY: "0" })).toBe(6);
    expect(maxConcurrency({ RPC_MAX_CONCURRENCY: "-2" })).toBe(6);
  });
});
