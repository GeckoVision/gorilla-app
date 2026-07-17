import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Lock,
  ScrollText,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrustBadge } from "@/components/hero/trust-badge";
import { LiveDevnetStats } from "@/components/hero/live-devnet-stats";
import { ProblemSection } from "@/components/home/problem-section";
import { HowItWorks } from "@/components/home/how-it-works";
import { explorerAddress, FORGE_PROGRAM_ID } from "@/lib/solana/config";

const FEATURES = [
  {
    icon: ScrollText,
    title: "Settled by proof, not an admin",
    body: "settle CPIs into TxODDS's on-chain oracle, which verifies a 3-stage Merkle proof against its own committed root. A tampered proof reverts the transaction.",
    href: "/settlement",
    cta: "Open the proof viewer",
    tone: "primary" as const,
  },
  {
    icon: Lock,
    title: "The agent physically can't overspend",
    body: "Every bet is signed inside a custody policy — a max-spend cap plus a program allow-list. An out-of-policy transaction is refused before a signature exists.",
    href: "/agent",
    cta: "Watch the agent decide",
    tone: "accent" as const,
  },
  {
    icon: Trophy,
    title: "A track record that lives on-chain",
    body: "Every market, outcome and payout is public program state. The agent's history is decoded straight from the chain — nothing to trust, everything to verify.",
    href: "/track-record",
    cta: "See the track record",
    tone: "gold" as const,
  },
];

const toneRing = {
  primary: "text-primary bg-primary/10 ring-primary/25",
  accent: "text-accent bg-accent/10 ring-accent/25",
  gold: "text-gold bg-gold/10 ring-gold/25",
};

export default function HomePage() {
  return (
    <>
      {/* ── Hero (editorial, left-aligned) ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
        <p className="eyebrow text-muted-foreground">
          Superteam × TxODDS · Prediction Markets &amp; Settlement
        </p>

        <h1 className="display-xl mt-5 max-w-4xl text-balance">
          Bet on sports — and{" "}
          <span className="text-gradient">actually get paid</span>.
        </h1>

        <p className="body-l mt-6 max-w-2xl text-muted-foreground text-pretty">
          An AI places the bets. When the match ends, the official data pays the
          winners automatically — on-chain. No bookie decides who won, and no
          company can sit on your money.
        </p>

        <div className="mt-8 flex flex-col items-start gap-5">
          <TrustBadge />
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/settlement">
                See a settlement
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/agent">Watch the agent</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a
                href={explorerAddress(FORGE_PROGRAM_ID.toBase58(), "devnet")}
                target="_blank"
                rel="noreferrer"
              >
                View program on Solana
                <ExternalLink />
              </a>
            </Button>
          </div>
        </div>

        <LiveDevnetStats className="mt-12" />
      </section>

      {/* ── The problem (cream-inverted band) ────────────────────────────── */}
      <ProblemSection />

      {/* ── How it works (3 steps + the real pipeline) ───────────────────── */}
      <HowItWorks />

      {/* ── Why it holds up (feature cards) ──────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="eyebrow text-primary">Why it holds up</p>
        <h2 className="display-l mt-4 max-w-2xl text-balance">
          Three guarantees, all on-chain.
        </h2>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} href={f.href} className="group">
              <Card className="h-full transition-colors hover:border-primary/30 group-hover:bg-card/80">
                <CardContent className="flex h-full flex-col gap-4">
                  <span
                    className={`flex size-11 items-center justify-center rounded-lg ring-1 ${toneRing[f.tone]}`}
                  >
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold leading-snug tracking-tight">
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-foreground">
                    {f.cta}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
