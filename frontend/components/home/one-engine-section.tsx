import { ArrowDown, ShieldCheck, Trophy, Umbrella } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { explorerTx } from "@/lib/solana/config";

/**
 * "One engine, two products" — the reusability beat (plan 1c in
 * docs/SETTLEMENT-ENGINE-FRONTEND.md). Makes ONE point, legibly to a bettor and
 * a judge: the same trustworthy payout that decides a match bet can decide other
 * things too — now proven LIVE on devnet, both settling through the same engine.
 *
 * LIVE: the settlement engine is deployed on devnet and both products settle
 * through it. Each link below is a real `settle` transaction whose logs show the
 * SAME engine CPI (forge program → settlement-core `9S6S…` → txoracle). The
 * match link is a settled market; the insurance link is a settled policy.
 */

// ── LIVE SEAM (both links are real on-chain settle transactions) ────────────
// Both signatures are `settle`/`settle_policy` txs that CPI the deployed engine.
//   match     — a settled market from backend/scripts/live-engine-settlements.json
//   insurance — the settled policy from backend/scripts/live-insurance-settlement.json
// Each tx's on-chain logs show `Program 9S6SwSp5…invoke` (the shared engine).
const ENGINE_DEPLOYED = true;
const EXPLORER_LINKS: { match: string; insurance: string } | null = {
  match: explorerTx(
    "GprYXh2mzUjHVNAcNbCJhtqVFmWgSxh6XuFr2R3CJgPBDB2AGZ4Wro4C6XpxP4yj4Vu1DgHqrhchg1ZAHBjXoiv",
  ),
  insurance: explorerTx(
    "2jwFUAXv8LLqRiTBGoAd4Uk9aqTg5UWofqeeNfe24tv7qxysDdhTsEDoeRPXVRoXGMnnXnMUeJ6RWYb5Dw2Mo17c",
  ),
};

const STATUS = ENGINE_DEPLOYED
  ? "Live on the test network — settling real markets and policies, side by side."
  : "Proven in our test suite — 18 checks, including a tampered-receipt reject on each. Live with the next release.";

const PRODUCTS = [
  {
    icon: Trophy,
    kind: "Match bet",
    body: "You backed a team. The final score decides it — nobody else.",
  },
  {
    icon: Umbrella,
    kind: "Insurance",
    body: "A payout if the match is called off. The same confirmed result decides it.",
  },
] as const;

/** The reusability proof — a dark purple→gold poster band, matching the problem beat. */
export function OneEngineSection() {
  return (
    <section
      aria-label="One engine, anything you bet on"
      className="relative isolate overflow-hidden border-y border-border"
    >
      {/* dark atmospheric wash to echo the problem band, mirrored so the two
          poster beats read as a pair (gold top-right → purple bottom-left). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 62% at 92% -6%, color-mix(in oklch, var(--gold) 20%, transparent), transparent 62%), radial-gradient(66% 66% at 4% 106%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 62%), linear-gradient(120deg, color-mix(in oklch, var(--primary) 12%, transparent) 0%, transparent 58%)",
          }}
        />
        <div className="poster-grain absolute inset-0" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <p className="eyebrow flex items-center gap-2 text-gold">
          <span aria-hidden className="font-display text-base">
            {"//"}
          </span>
          The same engine, anything you bet on
        </p>
        <h2 className="display-poster mt-4 max-w-3xl text-balance">
          One engine. Trustworthy on anything.
        </h2>
        <p className="body-l mt-6 max-w-2xl text-muted-foreground text-pretty">
          The thing that pays out your match bet isn&apos;t built for one game.
          Point it at anything people bet on — even a policy that pays if the
          match gets called off — and it works the same way: same rails, no house,
          decided by no one. We proved it live on devnet, settling a real market
          and a real policy through the very same engine.
        </p>

        {/* the two products, converging into one engine */}
        <div className="mt-14">
          <div className="grid gap-4 md:grid-cols-2">
            {PRODUCTS.map((p, i) => (
              <div
                key={p.kind}
                className="flex flex-col gap-4 rounded-xl border border-border bg-card/70 p-6 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25">
                    <p.icon className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold tracking-tight">
                    {p.kind}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
                {/* status line — a real link once EXPLORER_LINKS is filled post-deploy */}
                {EXPLORER_LINKS ? (
                  <a
                    href={
                      i === 0 ? EXPLORER_LINKS.match : EXPLORER_LINKS.insurance
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex w-fit items-center gap-1.5 border-t border-border/60 pt-4 text-sm font-medium text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
                  >
                    Settled by proof — see it on chain →
                  </a>
                ) : (
                  <p className="mt-auto border-t border-border/60 pt-4 text-sm font-medium text-foreground">
                    Settled by proof — decided by no one.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* converging arrow into the shared engine */}
          <div
            aria-hidden
            className="flex items-center justify-center py-6 text-muted-foreground/70"
          >
            <ArrowDown className="size-6" />
          </div>

          {/* the one engine — the shared node both products flow into */}
          <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-6 backdrop-blur-sm">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/25">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="eyebrow text-gold">One engine</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight">
                    Checked by proof, decided by no one.
                  </p>
                </div>
              </div>
              <Badge
                variant="gold"
                className="rounded-md px-3 py-1 text-xs leading-relaxed"
              >
                {STATUS}
              </Badge>
            </div>
            <p className="mt-5 border-t border-gold/20 pt-4 text-sm text-muted-foreground text-pretty">
              Not a one-off for one game — the same trustworthy payout, ready for
              whatever people bet on next.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
