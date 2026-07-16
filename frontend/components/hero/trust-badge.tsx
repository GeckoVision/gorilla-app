import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/** The "Verified by TxLINE on Solana" trust badge — the provider's own on-chain
 * proof is what settles every market. */
export function TrustBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "glow-primary inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-primary",
        className,
      )}
    >
      <ShieldCheck className="size-4" />
      Verified by TxLINE on Solana
    </span>
  );
}
