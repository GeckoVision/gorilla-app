import { describe, expect, it } from "vitest";

import { rpcEndpoint } from "@/lib/solana/config";
import { getConnection } from "@/lib/solana/connection";

/**
 * `getConnection` memoises one web3.js `Connection` per resolved endpoint and
 * points every chain read/send at the same-origin proxy. Construction is lazy
 * (no socket until a method is called), so these run offline.
 */
describe("getConnection — memoised same-origin RPC connection", () => {
  it("points the connection at the same-origin proxy endpoint for that mode", () => {
    const conn = getConnection("mainnet-sim");
    expect(conn.rpcEndpoint).toBe(rpcEndpoint("mainnet-sim"));
  });

  it("returns the same instance for consecutive calls with the same mode", () => {
    const a = getConnection("devnet");
    const b = getConnection("devnet");
    expect(b).toBe(a);
  });

  it("a different mode resolves a different endpoint and a distinct connection", () => {
    const dev = getConnection("devnet");
    const sim = getConnection("mainnet-sim");
    expect(sim).not.toBe(dev);
    expect(dev.rpcEndpoint).not.toBe(sim.rpcEndpoint);
  });
});
