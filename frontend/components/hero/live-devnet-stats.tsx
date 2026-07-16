"use client";

import { Activity } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMarkets } from "@/hooks/use-markets";
import { formatSol } from "@/lib/format";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  loading,
  tone = "default",
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: "default" | "primary" | "gold";
}) {
  return (
    <div className="flex flex-col gap-1">
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <span
          className={cn(
            "tabular text-2xl font-semibold tracking-tight",
            tone === "primary" && "text-primary",
            tone === "gold" && "text-gold",
          )}
        >
          {value}
        </span>
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** Live devnet vitals, read from on-chain program accounts. */
export function LiveDevnetStats({ className }: { className?: string }) {
  const { markets, loading } = useMarkets();
  const settled = markets?.filter((m) => m.state === "Settled") ?? [];
  const potLamports = (markets ?? []).reduce(
    (acc, m) => acc + m.potLamports,
    0n,
  );

  return (
    <div
      className={cn(
        "glass flex flex-wrap items-center gap-x-10 gap-y-4 rounded-xl px-6 py-5",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Activity className="size-4 text-primary" />
        Live on devnet
      </span>
      <Stat
        label="Markets on-chain"
        value={String(markets?.length ?? 0)}
        loading={loading}
      />
      <Stat
        label="Settled by proof"
        value={String(settled.length)}
        loading={loading}
        tone="primary"
      />
      <Stat
        label="Total pot (SOL)"
        value={formatSol(potLamports)}
        loading={loading}
        tone="gold"
      />
    </div>
  );
}
