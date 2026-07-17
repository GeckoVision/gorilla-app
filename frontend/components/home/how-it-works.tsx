import { Cpu, SlidersHorizontal, Wallet } from "lucide-react";

import { FlowPipeline } from "@/components/hero/flow-pipeline";

const STEPS = [
  {
    n: "01",
    icon: SlidersHorizontal,
    title: "Set your rules",
    body: "Decide how much to risk, and on what. That's your ceiling — the AI can never spend a cent more.",
  },
  {
    n: "02",
    icon: Cpu,
    title: "The AI plays",
    body: "It watches the live game and places smart bets for you — completely hands-off.",
  },
  {
    n: "03",
    icon: Wallet,
    title: "You get paid",
    body: "The moment the match ends, the official data pays the winners automatically. No one to ask, wait on, or trust.",
  },
];

export function HowItWorks() {
  return (
    <section aria-label="How it works" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <p className="eyebrow flex items-center gap-2 text-gold">
          <span aria-hidden className="font-display text-base">
            {"//"}
          </span>
          How it works
        </p>
        <h2 className="display-poster mt-4 max-w-2xl text-balance">
          Three steps. Then you&apos;re hands-off.
        </h2>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="relative flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-semibold tracking-tight text-primary/70">
                  {step.n}
                </span>
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25">
                  <step.icon className="size-5" />
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        {/* the real mechanism, beneath the plain-language steps */}
        <div className="mt-10 rounded-xl border border-border bg-card/60 p-6">
          <p className="eyebrow mb-6 text-muted-foreground">Under the hood</p>
          <FlowPipeline />
        </div>
      </div>
    </section>
  );
}
