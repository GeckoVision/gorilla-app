import { FORGE_PROGRAM_ID } from "@/lib/solana/config";
import { ExplorerLink } from "@/components/shared/explorer-link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 mt-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <p className="font-medium text-foreground">AgentForge Markets</p>
          <p className="max-w-md text-xs leading-relaxed">
            Trustless agent-settled prediction markets. Every outcome settles by
            the data provider&apos;s own on-chain Merkle proof — the program never
            calls the result.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 text-xs sm:items-end">
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground/70">forge_markets</span>
            <ExplorerLink value={FORGE_PROGRAM_ID.toBase58()} />
          </span>
          <span className="text-muted-foreground/60">
            Verified by TxLINE on Solana · Devnet
          </span>
        </div>
      </div>
    </footer>
  );
}
