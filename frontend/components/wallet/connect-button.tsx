"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, Copy, LogOut, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { copyText, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ConnectButton({ className }: { className?: string }) {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);

  if (!publicKey) {
    return (
      <Button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className={cn("font-medium", className)}
      >
        <Wallet />
        {connecting ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  const address = publicKey.toBase58();

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        onClick={async () => {
          if (await copyText(address)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }
        }}
        className="tabular flex items-center gap-2 rounded-md border border-input bg-secondary/50 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary cursor-pointer"
        title="Copy address"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        {shortAddress(address)}
        {copied ? (
          <Check className="size-3.5 text-primary" />
        ) : (
          <Copy className="size-3.5 text-muted-foreground" />
        )}
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => disconnect()}
        title="Disconnect"
        className="text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
