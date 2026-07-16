"use client";

import { useEffect, useState } from "react";

import { DATA_MODE } from "@/lib/solana/config";
import type { MarketAccount } from "@/lib/solana/forge-client";
import { fetchMarkets } from "@/lib/solana/markets";

interface MarketsState {
  markets: MarketAccount[] | null;
  error: string | null;
  loading: boolean;
}

/** All `Market` accounts the program owns, read live from the active cluster. */
export function useMarkets(): MarketsState {
  const [markets, setMarkets] = useState<MarketAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMarkets(DATA_MODE)
      .then((m) => alive && setMarkets(m))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return { markets, error, loading: markets === null && error === null };
}
