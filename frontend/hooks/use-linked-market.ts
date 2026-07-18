"use client";

import { useEffect, useState } from "react";

import { DATA_MODE } from "@/lib/solana/config";
import type { MarketAccount } from "@/lib/solana/forge-client";
import { fetchMarket } from "@/lib/solana/markets";
import { parseMarketParam } from "@/lib/solana/share";

export type LinkedMarketState =
  | { status: "none"; market: null } // no ?market= param on the URL
  | { status: "loading"; market: null }
  | { status: "ok"; market: MarketAccount }
  // Bad address, no such account, or not a Market the forge program owns —
  // all one honest state: this link doesn't point to a market.
  | { status: "invalid"; market: null };

/**
 * Resolve the `?market=` deep-link param to a real on-chain Market. Fail-closed:
 * anything that doesn't parse AND fetch AND decode as a forge-owned Market is
 * `invalid` — never a crash, never an invented market.
 */
export function useLinkedMarket(rawParam: string | null): LinkedMarketState {
  const address = parseMarketParam(rawParam);
  // Keyed by address so a stale fetch for a previous param is never read as current.
  const [fetched, setFetched] = useState<{
    address: string;
    market: MarketAccount | null;
  } | null>(null);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    fetchMarket(address, DATA_MODE)
      .then((m) => alive && setFetched({ address, market: m }))
      .catch(() => alive && setFetched({ address, market: null }));
    return () => {
      alive = false;
    };
  }, [address]);

  if (rawParam === null) return { status: "none", market: null };
  if (address === null) return { status: "invalid", market: null };
  if (fetched?.address !== address) return { status: "loading", market: null };
  return fetched.market
    ? { status: "ok", market: fetched.market }
    : { status: "invalid", market: null };
}
