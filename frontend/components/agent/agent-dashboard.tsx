"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Cpu,
  LoaderCircle,
  Play,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OddsFeed } from "@/components/agent/odds-feed";
import { PolicyPanel } from "@/components/agent/policy-panel";
import {
  BET,
  FIXTURE,
  ODDS_SERIES,
  RISK_POLICY,
  SHARP_MOVE,
} from "@/lib/agent/scenario";
import { cn } from "@/lib/utils";

// phase: 0 idle · 1 reading odds · 2 sharp move detected · 3 bet decided · 4 signed
type Phase = 0 | 1 | 2 | 3 | 4;

const STEPS = [
  {
    title: "Read live odds",
    detail: `Watching implied P(goal) across ${ODDS_SERIES.length} ticks from TxLINE.`,
    reachedAt: 1,
  },
  {
    title: "Detect a sharp move",
    detail: `+${SHARP_MOVE.deltaPct.toFixed(1)}% at seq ${SHARP_MOVE.atSeq} — over the ${SHARP_MOVE.thresholdPct.toFixed(1)}% threshold.`,
    reachedAt: 2,
  },
  {
    title: "Decide the bet",
    detail: `Back ${BET.side} · ${BET.amountSol} SOL (within the ${RISK_POLICY.maxStakeSol} SOL risk cap).`,
    reachedAt: 3,
  },
  {
    title: "Sign within custody policy",
    detail: `stake signed — under the spend cap and on the allow-list.`,
    reachedAt: 4,
  },
] as const;

function StepRow({
  index,
  title,
  detail,
  state,
}: {
  index: number;
  title: string;
  detail: string;
  state: "pending" | "active" | "done";
}) {
  return (
    <div className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
          state === "done" && "bg-primary text-primary-foreground",
          state === "active" && "bg-accent/20 text-accent ring-1 ring-accent/40",
          state === "pending" && "bg-secondary text-muted-foreground",
        )}
      >
        {state === "done" ? (
          <Check className="size-3.5" />
        ) : state === "active" ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          index + 1
        )}
      </span>
      <div className="flex flex-col gap-0.5 pb-1">
        <span
          className={cn(
            "text-sm font-medium transition-colors",
            state === "pending" && "text-muted-foreground",
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "text-xs text-muted-foreground transition-opacity",
            state === "pending" && "opacity-0",
          )}
        >
          {detail}
        </span>
      </div>
    </div>
  );
}

export function AgentDashboard() {
  const [phase, setPhase] = useState<Phase>(0);
  const [revealed, setRevealed] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const run = useCallback(() => {
    clearTimers();
    setPhase(1);
    setRevealed(0);
    const schedule = (fn: () => void, ms: number) =>
      timers.current.push(setTimeout(fn, ms));

    // Reveal odds ticks one at a time.
    ODDS_SERIES.forEach((_, i) => {
      schedule(() => setRevealed(i + 1), 240 * (i + 1));
    });
    const afterTicks = 240 * ODDS_SERIES.length;

    // The sharp-move tick lands → detector flags it.
    schedule(() => setPhase(2), 240 * (SHARP_MOVE.atSeq + 1) + 260);
    // Decision, then policy-gated signature.
    schedule(() => setPhase(3), afterTicks + 500);
    schedule(() => setPhase(4), afterTicks + 1150);
  }, []);

  // Auto-play once on mount.
  useEffect(() => {
    const t = setTimeout(run, 450);
    return () => {
      clearTimeout(t);
      clearTimers();
    };
  }, [run]);

  const flagged = phase >= 2;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Console */}
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/25">
                <Cpu className="size-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  Sharp-move betting agent
                </h2>
                <p className="text-xs text-muted-foreground">
                  {FIXTURE.competition} · {FIXTURE.label} · {FIXTURE.statLabel}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={phase === 4 ? "outline" : "default"}
              onClick={run}
            >
              {phase === 0 || phase === 4 ? (
                <>
                  {phase === 4 ? <RotateCcw /> : <Play />}
                  {phase === 4 ? "Replay" : "Run agent"}
                </>
              ) : (
                <>
                  <LoaderCircle className="animate-spin" />
                  Running
                </>
              )}
            </Button>
          </div>

          <OddsFeed revealed={revealed} flagged={flagged} />

          <Separator />

          <div className="flex flex-col gap-3">
            {STEPS.map((step, i) => {
              const state =
                phase >= step.reachedAt
                  ? "done"
                  : phase === step.reachedAt - 1 && phase > 0
                    ? "active"
                    : "pending";
              return (
                <StepRow
                  key={step.title}
                  index={i}
                  title={step.title}
                  detail={step.detail}
                  state={state}
                />
              );
            })}
          </div>

          {/* Result */}
          {phase >= 4 && (
            <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Signed bet intent
                </span>
                <Badge variant="yes">
                  <Check />
                  Signed within policy
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Side</span>
                  <span className="text-lg font-semibold text-primary">
                    {BET.side}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Stake</span>
                  <span className="tabular text-lg font-semibold">
                    {BET.amountSol} SOL
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Market</span>
                  <span className="text-sm font-medium">
                    {FIXTURE.statLabel}
                  </span>
                </div>
              </div>
              <p className="text-xs italic text-muted-foreground">
                “{BET.rationale}”
              </p>
              <Button asChild variant="outline" size="sm" className="w-fit">
                <Link href="/settlement">
                  Follow this market to settlement
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Policy */}
      <Card>
        <CardContent>
          <PolicyPanel />
        </CardContent>
      </Card>
    </div>
  );
}
