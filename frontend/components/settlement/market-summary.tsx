"use client";

import { CircleCheck, CircleDot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ExplorerLink } from "@/components/shared/explorer-link";
import type { ExplorerCluster } from "@/lib/solana/config";
import {
  COMPARISON_SYMBOL,
  type MarketAccount,
} from "@/lib/solana/forge-client";
import { formatSol } from "@/lib/format";
import { cn } from "@/lib/utils";

export function predicateLabel(market: MarketAccount): string {
  return `stat #${market.statKey} ${COMPARISON_SYMBOL[market.predicate.comparison]} ${market.predicate.threshold}`;
}

function StakeBar({ market }: { market: MarketAccount }) {
  const total = Number(market.potLamports) || 1;
  const yesPct = (Number(market.stakeYes) / total) * 100;
  const settled = market.state === "Settled";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-background/60">
        <div
          className={cn("bg-yes", settled && market.winner !== "Yes" && "opacity-40")}
          style={{ width: `${yesPct}%` }}
        />
        <div
          className={cn("bg-no", settled && market.winner !== "No" && "opacity-40")}
          style={{ width: `${100 - yesPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-yes" />
          <span className="text-muted-foreground">YES</span>
          <span className="tabular font-medium">
            {formatSol(market.stakeYes)} SOL
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="tabular font-medium">
            {formatSol(market.stakeNo)} SOL
          </span>
          <span className="text-muted-foreground">NO</span>
          <span className="size-2 rounded-full bg-no" />
        </span>
      </div>
    </div>
  );
}

export function MarketSummary({
  market,
  cluster = "devnet",
}: {
  market: MarketAccount;
  cluster?: ExplorerCluster;
}) {
  const settled = market.state === "Settled";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Fixture {market.fixtureId.toString()}
          </span>
          <span className="font-mono text-xl font-semibold tracking-tight">
            {predicateLabel(market)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {settled ? (
            <Badge variant="yes">
              <CircleCheck className="size-3" />
              Settled
            </Badge>
          ) : (
            <Badge variant="accent">
              <CircleDot className="size-3" />
              Open
            </Badge>
          )}
          {settled && (
            <span className="text-xs text-muted-foreground">
              winner{" "}
              <span
                className={cn(
                  "font-semibold",
                  market.winner === "Yes" ? "text-yes" : "text-no",
                )}
              >
                {market.winner}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Pot</span>
          <span className="tabular text-2xl font-semibold text-gold">
            {formatSol(market.potLamports)}{" "}
            <span className="text-base text-muted-foreground">SOL</span>
          </span>
        </div>
        <StakeBar market={market} />
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 border-t border-border/60 pt-4 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Market</dt>
          <dd>
            <ExplorerLink value={market.address} cluster={cluster} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Vault</dt>
          <dd>
            <ExplorerLink value={market.vault} cluster={cluster} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Authority</dt>
          <dd>
            <ExplorerLink value={market.authority} cluster={cluster} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Stat key</dt>
          <dd className="tabular font-mono text-xs">#{market.statKey}</dd>
        </div>
      </dl>
    </div>
  );
}
