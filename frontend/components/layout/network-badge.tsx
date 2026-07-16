import { DATA_MODE, getNetworkConfig } from "@/lib/solana/config";
import { cn } from "@/lib/utils";

/** Reflects the active data-source mode. Today: Devnet (live). The `mainnet-sim`
 * branch is the seam for a future mainnet-simulation toggle. */
export function NetworkBadge({ className }: { className?: string }) {
  const config = getNetworkConfig(DATA_MODE);
  const live = config.live;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      <span className="relative flex size-2">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            live ? "bg-primary" : "bg-gold",
          )}
        />
      </span>
      <span className="text-muted-foreground">{config.label}</span>
    </span>
  );
}
