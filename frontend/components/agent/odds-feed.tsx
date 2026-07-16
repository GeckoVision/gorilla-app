"use client";

import { Radio, TrendingUp } from "lucide-react";

import { ODDS_SERIES, SHARP_MOVE } from "@/lib/agent/scenario";
import { cn } from "@/lib/utils";

const MIN_PCT = 49;
const MAX_PCT = 60;

function barHeight(pct: number): string {
  const t = (pct - MIN_PCT) / (MAX_PCT - MIN_PCT);
  return `${Math.round(28 + t * 72)}%`;
}

/** The moving market as the agent reads it, tick by tick. `revealed` controls how
 * many ticks are visible; `flagged` lights up the sharp-move tick. */
export function OddsFeed({
  revealed,
  flagged,
}: {
  revealed: number;
  flagged: boolean;
}) {
  const current = ODDS_SERIES[Math.min(revealed, ODDS_SERIES.length) - 1] ?? ODDS_SERIES[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Radio className="size-4 text-accent" />
          Odds feed · TxLINE
        </span>
        <span className="tabular text-xs text-muted-foreground">
          seq {current.seq}
        </span>
      </div>

      <div className="flex items-end justify-between gap-1.5 h-32 rounded-lg bg-background/40 p-3">
        {ODDS_SERIES.map((tick, i) => {
          const visible = i < revealed;
          const isMove = tick.seq === SHARP_MOVE.atSeq;
          const lit = isMove && flagged;
          return (
            <div
              key={tick.seq}
              className="flex flex-1 flex-col items-center justify-end gap-1.5 h-full"
            >
              <div
                className={cn(
                  "w-full rounded-sm transition-all duration-500",
                  !visible && "opacity-0",
                  lit
                    ? "bg-primary"
                    : isMove
                      ? "bg-accent/70"
                      : "bg-muted-foreground/25",
                )}
                style={{ height: visible ? barHeight(tick.impliedPct) : "0%" }}
              />
              <span
                className={cn(
                  "tabular text-[10px] transition-opacity",
                  visible ? "text-muted-foreground/70" : "opacity-0",
                )}
              >
                {tick.seq}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            Implied P(goal)
          </span>
          <span className="tabular text-3xl font-semibold tracking-tight">
            {current.impliedPct.toFixed(1)}
            <span className="text-lg text-muted-foreground">%</span>
          </span>
        </div>
        {flagged && (
          <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <TrendingUp className="size-3.5" />+{SHARP_MOVE.deltaPct.toFixed(1)}%
            move
          </span>
        )}
      </div>
    </div>
  );
}
