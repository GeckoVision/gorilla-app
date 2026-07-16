import { describe, expect, it, vi } from "vitest";
import type { Connection } from "@solana/web3.js";

import { confirmSignature } from "@/lib/solana/confirm";

function fakeConn(getSignatureStatuses: unknown): Connection {
  return { getSignatureStatuses } as unknown as Connection;
}

const instantSleep = async () => {};

describe("confirmSignature — HTTP polling (no websocket)", () => {
  it("returns the confirmation status once confirmed", async () => {
    const conn = fakeConn(async () => ({
      value: [{ err: null, confirmationStatus: "confirmed" }],
    }));
    await expect(
      confirmSignature(conn, "sig", { sleepImpl: instantSleep }),
    ).resolves.toBe("confirmed");
  });

  it("returns 'finalized'", async () => {
    const conn = fakeConn(async () => ({
      value: [{ err: null, confirmationStatus: "finalized" }],
    }));
    await expect(
      confirmSignature(conn, "sig", { sleepImpl: instantSleep }),
    ).resolves.toBe("finalized");
  });

  it("returns 'failed' when the tx reverted", async () => {
    const conn = fakeConn(async () => ({
      value: [{ err: { InstructionError: [] }, confirmationStatus: "confirmed" }],
    }));
    await expect(
      confirmSignature(conn, "sig", { sleepImpl: instantSleep }),
    ).resolves.toBe("failed");
  });

  it("returns 'timeout' when it never confirms, bounded by the deadline", async () => {
    let clock = 0;
    const getStatuses = vi.fn(async () => ({ value: [null] }));
    const outcome = await confirmSignature(fakeConn(getStatuses), "sig", {
      timeoutMs: 1000,
      pollMs: 300,
      now: () => clock,
      sleepImpl: async (ms) => {
        clock += ms;
      },
    });
    expect(outcome).toBe("timeout");
    expect(getStatuses.mock.calls.length).toBeGreaterThan(0);
    expect(getStatuses.mock.calls.length).toBeLessThan(6);
  });

  it("tolerates a transient status-lookup error and keeps polling", async () => {
    let call = 0;
    const conn = fakeConn(async () => {
      call++;
      if (call === 1) throw new Error("429");
      return { value: [{ err: null, confirmationStatus: "confirmed" }] };
    });
    await expect(
      confirmSignature(conn, "sig", { sleepImpl: instantSleep }),
    ).resolves.toBe("confirmed");
    expect(call).toBe(2);
  });
});
