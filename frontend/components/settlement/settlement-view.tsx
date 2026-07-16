"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketSummary, predicateLabel } from "@/components/settlement/market-summary";
import { MerkleProofViewer } from "@/components/settlement/merkle-proof-viewer";
import { SettlementActivity } from "@/components/settlement/settlement-activity";
import { PlaceBetPanel } from "@/components/settlement/place-bet-panel";
import { useMarkets } from "@/hooks/use-markets";
import {
  DATA_MODE,
  explorerTx,
  FEATURED_MARKETS,
  getNetworkConfig,
} from "@/lib/solana/config";
import {
  fetchMarketTransactions,
  findSettleTx,
  type MarketTx,
} from "@/lib/solana/markets";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SettlementView() {
  const config = getNetworkConfig(DATA_MODE);
  const { markets, loading } = useMarkets();
  const [selected, setSelected] = useState<string>(FEATURED_MARKETS[0]);
  // Keyed by address so a stale result for a previously-selected market is
  // detectable during render (no synchronous reset inside the effect).
  const [txState, setTxState] = useState<{
    address: string;
    txs: MarketTx[] | null;
  }>({ address: FEATURED_MARKETS[0], txs: null });

  const featured = useMemo(() => {
    const set = new Set<string>(FEATURED_MARKETS);
    return (markets ?? []).filter((m) => set.has(m.address));
  }, [markets]);

  const market = featured.find((m) => m.address === selected) ?? null;

  useEffect(() => {
    let alive = true;
    fetchMarketTransactions(selected, config, 10)
      .then((t) => alive && setTxState({ address: selected, txs: t }))
      .catch(() => alive && setTxState({ address: selected, txs: [] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const txs = txState.address === selected ? txState.txs : null;
  const txLoading = txs === null;
  const settleTx = txs ? findSettleTx(txs) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* market selector */}
      <div className="flex flex-wrap items-center gap-2">
        {FEATURED_MARKETS.map((addr) => {
          const m = featured.find((x) => x.address === addr);
          const active = addr === selected;
          return (
            <button
              key={addr}
              onClick={() => setSelected(addr)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                active
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/70 hover:bg-secondary",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  active ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <span className="font-medium">
                {m ? `Fixture ${m.fixtureId}` : shortAddress(addr)}
              </span>
              {m && (
                <span className="text-xs text-muted-foreground">
                  {predicateLabel(m)}
                </span>
              )}
            </button>
          );
        })}
        {settleTx && (
          <a
            href={explorerTx(settleTx.signature, config.explorerCluster)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <ShieldCheck className="size-4" />
            View settle transaction
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* the centerpiece */}
        <Card className="lg:col-span-2">
          <CardContent>
            <MerkleProofViewer
              predicateLabel={market ? predicateLabel(market) : "stat #1 > 0"}
              winner={market?.winner ?? "Yes"}
            />
          </CardContent>
        </Card>

        {/* live market + place a bet */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent>
              {market ? (
                <MarketSummary market={market} cluster={config.explorerCluster} />
              ) : loading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Could not load this market from the current RPC.
                </p>
              )}
            </CardContent>
          </Card>

          {market && (
            <Card>
              <CardContent>
                <PlaceBetPanel market={market} cluster={config.explorerCluster} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* lifecycle */}
      <Card>
        <CardContent>
          <SettlementActivity
            txs={txs}
            loading={txLoading}
            cluster={config.explorerCluster}
          />
        </CardContent>
      </Card>
    </div>
  );
}
