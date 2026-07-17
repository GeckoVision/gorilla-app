"use client";

import { cn } from "@/lib/utils";
import { MarketSummary } from "@/components/settlement/market-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkets } from "@/hooks/use-markets";

/**
 * The poster's cut-out subject: a REAL settlement/market card, rendered from the
 * same on-chain data source the rest of the page uses ({@link useMarkets}). Hard
 * square edges + a soft radial purple/gold backlight so it floats in FRONT of the
 * oversized headline. It reuses {@link MarketSummary} verbatim — no fabricated
 * data, no visual fork of the functional card.
 */
export function HeroMarketCard({ className }: { className?: string }) {
  const { markets, loading } = useMarkets();
  // Prefer a settled market — it shows the full arc (verdict + pot), the most
  // convincing "real product" read. Falls back to the first market, then a
  // skeleton while the chain read is in flight.
  const featured =
    (markets ?? []).find((m) => m.state === "Settled") ??
    (markets ?? [])[0] ??
    null;

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      {/* backlight — sits BETWEEN the giant type and the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 blur-3xl"
        style={{
          background:
            "radial-gradient(58% 58% at 42% 32%, color-mix(in oklch, var(--primary) 60%, transparent), transparent 72%), radial-gradient(52% 52% at 74% 96%, color-mix(in oklch, var(--gold) 42%, transparent), transparent 70%)",
        }}
      />
      {/* the card — hard-masked square edges, opaque, in front of the type */}
      <div className="relative rounded-none border border-primary/25 bg-card/95 p-5 shadow-2xl ring-1 ring-primary/15 backdrop-blur-sm sm:p-6">
        {featured ? (
          <MarketSummary market={featured} cluster="devnet" />
        ) : loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Live markets load from the devnet RPC.
          </p>
        )}
      </div>
    </div>
  );
}
