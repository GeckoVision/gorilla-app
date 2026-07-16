/**
 * Server-side upstream resolution for the RPC proxy. Pure + env-injectable so
 * it's unit-testable. The upstream is chosen from a fixed set keyed by `mode` —
 * never taken from the request — so the proxy can't be pointed at an arbitrary
 * host (no SSRF).
 *
 * Order (Helius-first — public devnet is heavily rate-limited):
 *   DEVNET_RPC_URL  >  HELIUS_API_KEY  >  public devnet fallback.
 */

export type RpcMode = "devnet" | "mainnet-sim";

export const PUBLIC_DEVNET = "https://api.devnet.solana.com";

export interface RpcEnv {
  DEVNET_RPC_URL?: string;
  HELIUS_API_KEY?: string;
  MAINNET_SIM_RPC_URL?: string;
  RPC_MAX_CONCURRENCY?: string;
}

export function resolveUpstream(
  mode: RpcMode,
  env: RpcEnv = process.env as RpcEnv,
): string | null {
  if (mode === "mainnet-sim") {
    // Future toggle: a mainnet-fork endpoint. Not configured by default.
    return env.MAINNET_SIM_RPC_URL ?? null;
  }
  if (env.DEVNET_RPC_URL) return env.DEVNET_RPC_URL;
  if (env.HELIUS_API_KEY) {
    return `https://devnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  }
  return PUBLIC_DEVNET;
}

/** Whether the resolved upstream is the rate-limited public devnet fallback. */
export function isPublicFallback(upstream: string): boolean {
  return upstream === PUBLIC_DEVNET;
}

export function maxConcurrency(env: RpcEnv = process.env as RpcEnv): number {
  const parsed = Number(env.RPC_MAX_CONCURRENCY);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 6;
}
