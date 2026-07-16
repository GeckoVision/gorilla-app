"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import {
  explorerAddress,
  explorerTx,
  type ExplorerCluster,
} from "@/lib/solana/config";
import { copyText, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ExplorerLinkProps {
  value: string;
  kind?: "address" | "tx";
  cluster?: ExplorerCluster;
  short?: boolean;
  copyable?: boolean;
  className?: string;
  label?: string;
}

/** A monospace on-chain identity: short by default, copy-on-click, links to the
 * Solana explorer for the active cluster. */
export function ExplorerLink({
  value,
  kind = "address",
  cluster = "devnet",
  short = true,
  copyable = true,
  className,
  label,
}: ExplorerLinkProps) {
  const [copied, setCopied] = useState(false);
  const href = kind === "tx" ? explorerTx(value, cluster) : explorerAddress(value, cluster);
  const text = label ?? (short ? shortAddress(value, 4, 4) : value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground",
        className,
      )}
    >
      {copyable && (
        <button
          type="button"
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }
          }}
          title="Copy"
          className="cursor-pointer text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3 text-primary" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      )}
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {text}
        <ExternalLink className="size-3 opacity-70" />
      </a>
    </span>
  );
}
