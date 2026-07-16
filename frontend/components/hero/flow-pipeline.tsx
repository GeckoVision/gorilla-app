import { ChevronRight, Cpu, Radio, ScrollText, ShieldCheck, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

const STAGES = [
  { icon: Radio, label: "Read live odds", tone: "accent" },
  { icon: Cpu, label: "Detect sharp move", tone: "accent" },
  { icon: ShieldCheck, label: "Policy-gated bet", tone: "primary" },
  { icon: ScrollText, label: "Settle by Merkle proof", tone: "primary" },
  { icon: Trophy, label: "On-chain payout", tone: "gold" },
] as const;

const toneMap = {
  accent: "text-accent bg-accent/10 ring-accent/25",
  primary: "text-primary bg-primary/10 ring-primary/25",
  gold: "text-gold bg-gold/10 ring-gold/25",
};

/** The end-to-end loop as a single glance — the spine of the whole demo. */
export function FlowPipeline({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-1 gap-y-3 md:justify-between",
        className,
      )}
    >
      {STAGES.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-1 md:gap-2">
          <div className="flex flex-col items-center gap-2 px-1 text-center md:px-2">
            <span
              className={cn(
                "flex size-11 items-center justify-center rounded-xl ring-1",
                toneMap[stage.tone],
              )}
            >
              <stage.icon className="size-5" />
            </span>
            <span className="max-w-[6.5rem] text-xs font-medium text-muted-foreground">
              {stage.label}
            </span>
          </div>
          {i < STAGES.length - 1 && (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
          )}
        </div>
      ))}
    </div>
  );
}
