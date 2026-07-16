"use client";

import { useState } from "react";

import { toHex } from "@/lib/solana/proof";
import { copyText } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A 32-byte Merkle hash rendered as monospace hex, truncated, copy-on-click. */
export function HashChip({
  bytes,
  className,
  tone = "muted",
}: {
  bytes: number[];
  className?: string;
  tone?: "muted" | "primary" | "accent" | "gold";
}) {
  const [copied, setCopied] = useState(false);
  const hex = toHex(bytes);
  const toneClass = {
    muted: "text-muted-foreground",
    primary: "text-primary",
    accent: "text-accent",
    gold: "text-gold",
  }[tone];

  return (
    <button
      type="button"
      title={hex}
      onClick={async () => {
        if (await copyText(hex)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        }
      }}
      className={cn(
        "tabular cursor-pointer truncate rounded bg-background/60 px-1.5 py-0.5 font-mono text-[11px] leading-tight transition-colors hover:bg-secondary",
        toneClass,
        className,
      )}
    >
      {copied ? "copied ✓" : `${hex.slice(0, 10)}…${hex.slice(-10)}`}
    </button>
  );
}
