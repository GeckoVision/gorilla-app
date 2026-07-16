import type { Connection } from "@solana/web3.js";

export type ConfirmOutcome = "confirmed" | "finalized" | "failed" | "timeout";

export interface ConfirmOptions {
  timeoutMs?: number;
  pollMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  now?: () => number;
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Confirm a transaction by polling `getSignatureStatuses` over HTTP — no
 * WebSocket. The proxy `Connection` has no ws endpoint, so web3.js's default
 * `confirmTransaction` (which opens a signature subscription) would hang; this
 * polls instead, tolerates transient status-lookup failures, and is bounded by
 * a timeout so the caller never waits forever.
 */
export async function confirmSignature(
  conn: Connection,
  signature: string,
  { timeoutMs = 30_000, pollMs = 1200, sleepImpl = realSleep, now = Date.now }: ConfirmOptions = {},
): Promise<ConfirmOutcome> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    try {
      const { value } = await conn.getSignatureStatuses([signature]);
      const status = value[0];
      if (status) {
        if (status.err) return "failed";
        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          return status.confirmationStatus;
        }
      }
    } catch {
      // transient RPC hiccup — keep polling until the deadline.
    }
    await sleepImpl(pollMs);
  }
  return "timeout";
}
