"use client";

import { useState } from "react";
import { Ban, Check, Lock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CUSTODY_POLICY, REFUSALS, type RefusalDemo } from "@/lib/agent/scenario";

function RefusalRow({ demo }: { demo: RefusalDemo }) {
  const [refused, setRefused] = useState(false);
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{demo.title}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {demo.attempt}
          </span>
        </div>
        {refused ? (
          <span className="flex items-center gap-1.5 rounded-md bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive">
            <Ban className="size-3.5" />
            Refused
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRefused(true)}
            className="shrink-0"
          >
            Try it
          </Button>
        )}
      </div>
      {refused && (
        <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <span className="font-mono text-destructive">{demo.code}</span> —{" "}
          {demo.reason}. No signature was ever produced.
        </p>
      )}
    </div>
  );
}

export function PolicyPanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25">
          <Lock className="size-4.5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Custody policy</h3>
          <p className="text-xs text-muted-foreground">
            Enforced by the wallet before a signature exists.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
        <span className="text-sm text-muted-foreground">Max spend / bet</span>
        <span className="tabular text-sm font-semibold text-primary">
          {CUSTODY_POLICY.maxSpendSol} SOL
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">
          Program allow-list
        </span>
        <div className="flex flex-wrap gap-1.5">
          {CUSTODY_POLICY.allow.map((a) => (
            <Badge key={a.instruction} variant="secondary" className="font-mono">
              <Check className="text-primary" />
              {a.program}::{a.instruction}
            </Badge>
          ))}
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          A prompt-injected or buggy agent can only ever place a bounded bet into{" "}
          <span className="font-medium text-foreground">forge_markets</span> — it{" "}
          <span className="font-medium text-foreground">
            physically cannot exceed the cap or drain the wallet
          </span>
          .
        </span>
      </p>

      <div className="flex flex-col gap-2">
        {REFUSALS.map((demo) => (
          <RefusalRow key={demo.id} demo={demo} />
        ))}
      </div>
    </div>
  );
}
