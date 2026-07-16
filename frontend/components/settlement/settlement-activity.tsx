"use client";

import {
  CircleDot,
  Hash,
  ScrollText,
  ShieldCheck,
  Ticket,
  Trophy,
  TriangleAlert,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ExplorerLink } from "@/components/shared/explorer-link";
import type { ExplorerCluster } from "@/lib/solana/config";
import type { MarketTx, MarketTxKind } from "@/lib/solana/markets";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  MarketTxKind,
  { label: string; icon: typeof Hash; highlight?: boolean }
> = {
  create_market: { label: "Market created", icon: CircleDot },
  stake: { label: "Stake placed", icon: Ticket },
  settle: { label: "Settled by proof", icon: ShieldCheck, highlight: true },
  claim: { label: "Payout claimed", icon: Trophy },
  other: { label: "Transaction", icon: Hash },
};

export function SettlementActivity({
  txs,
  loading,
  cluster = "devnet",
}: {
  txs: MarketTx[] | null;
  loading: boolean;
  cluster?: ExplorerCluster;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ScrollText className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">On-chain lifecycle</h3>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !txs || txs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No transactions found for this market on the current RPC.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {/* oldest → newest reads as the market's lifecycle */}
          {[...txs].reverse().map((tx) => {
            const meta = KIND_META[tx.kind];
            return (
              <li
                key={tx.signature}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  meta.highlight
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/70 bg-card",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1",
                    meta.highlight
                      ? "bg-primary/10 text-primary ring-primary/25"
                      : "bg-secondary text-muted-foreground ring-border",
                  )}
                >
                  <meta.icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {meta.label}
                    {tx.err && (
                      <TriangleAlert className="size-3.5 text-destructive" />
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(tx.blockTime)}
                  </span>
                </div>
                <div className="ml-auto shrink-0">
                  <ExplorerLink value={tx.signature} kind="tx" cluster={cluster} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
