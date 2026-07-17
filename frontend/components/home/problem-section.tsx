import { Ban, CircleCheck } from "lucide-react";

const EXCUSES = ["“Under review.”", "“Check back later.”", "Somehow it went the other way."];
const PROMISES = [
  "No person decides who won.",
  "No company holds your cash.",
  "The match data decides — the payout is automatic.",
];

/** The emotional contrast beat, on the page's single cream-inverted band. */
export function ProblemSection() {
  return (
    <section aria-label="The problem" className="surface-cream border-y border-border">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <p className="eyebrow text-primary">The problem</p>
        <h2 className="display-l mt-4 max-w-3xl text-balance">
          You win. Then the excuses start.
        </h2>
        <p className="body-l mt-6 max-w-2xl text-muted-foreground text-pretty">
          “Under review.” “Check back later.” Or a result that somehow went the
          other way. You did everything right and walked away with nothing.
          AgentForge ends that — no person decides who won, no company holds your
          cash. The match data decides, and the payout is automatic.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <span className="eyebrow text-no">Everywhere else</span>
            <ul className="mt-4 flex flex-col gap-3">
              {EXCUSES.map((e) => (
                <li key={e} className="flex items-center gap-3 text-sm">
                  <Ban className="size-4 shrink-0 text-no" />
                  <span className="text-muted-foreground">{e}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-border pt-4 text-sm font-medium">
              You won. You waited. You got nothing.
            </p>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
            <span className="eyebrow text-primary">AgentForge</span>
            <ul className="mt-4 flex flex-col gap-3">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm">
                  <CircleCheck className="size-4 shrink-0 text-yes" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-primary/20 pt-4 text-sm font-semibold text-primary">
              You win, you get paid. Full stop.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
