"use client";

import { useState } from "react";
import { ChevronDown, Waypoints } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HashChip } from "@/components/shared/hash-chip";
import type { ProofNode } from "@/lib/solana/proof";
import { cn } from "@/lib/utils";

/**
 * One stage of the Merkle proof: the sibling hashes that fold the root below up
 * to the root above. Collapsible — the whole point is that you can open it and
 * see the real 32-byte hashes the oracle recomputes.
 */
export function ProofPath({
  nodes,
  targetLabel,
  defaultOpen = false,
}: {
  nodes: ProofNode[];
  targetLabel: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="relative pl-6">
      {/* vertical connector between the two roots */}
      <span className="absolute left-[11px] top-0 h-full w-px bg-gradient-to-b from-border via-border to-border" />

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 py-2 text-left cursor-pointer">
          <span className="relative z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground -ml-[25px]">
            <Waypoints className="size-3" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {nodes.length} sibling {nodes.length === 1 ? "hash" : "hashes"}
          </span>
          <span className="text-xs text-muted-foreground/60">
            · fold up to {targetLabel}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ul className="flex flex-col gap-1.5 pb-2 pt-1">
            {nodes.map((node, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md bg-background/40 px-2 py-1.5"
              >
                <span className="tabular text-[10px] text-muted-foreground/60 w-4">
                  {i}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    node.isRightSibling
                      ? "bg-accent/10 text-accent"
                      : "bg-info/10 text-info",
                  )}
                >
                  {node.isRightSibling ? "right" : "left"}
                </span>
                <HashChip bytes={node.hash} className="min-w-0 flex-1" />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
