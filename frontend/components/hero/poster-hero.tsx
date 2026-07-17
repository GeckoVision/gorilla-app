import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TrustBadge } from "@/components/hero/trust-badge";
import { LiveDevnetStats } from "@/components/hero/live-devnet-stats";
import { HeroMarketCard } from "@/components/hero/hero-market-card";
import { explorerAddress, FORGE_PROGRAM_ID } from "@/lib/solana/config";

/**
 * Sports-poster hero. The z-sandwich, back to front:
 *   z-0  ambient texture (grain + column rules + purple/gold glow)
 *   z-10 oversized compressed ALL-CAPS headline (the "background type")
 *   z-20 the REAL product card, square-edged, floating over the type
 *   z-30 foreground UI — eyebrow, subhead, trust badge, CTAs, live stats
 * The full approved message is preserved for a11y/SEO (sr-only); the visible
 * type is the compressed poster cut of it.
 */
export function PosterHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border/60">
      {/* ── z-0 · ambient poster texture ─────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="poster-vgrid absolute inset-0" />
        {/* purple → gold backlight, anchored where the card floats */}
        <div
          className="absolute -top-24 right-[-10%] h-[42rem] w-[42rem] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklch, var(--primary) 26%, transparent), transparent 78%)",
          }}
        />
        <div
          className="absolute bottom-[-20%] right-[6%] h-[26rem] w-[26rem] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklch, var(--gold) 18%, transparent), transparent 76%)",
          }}
        />
        <div className="poster-grain absolute inset-0" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-16 pb-16 sm:px-6 sm:pt-24">
        {/* eyebrow — gold slash detail, top-left */}
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <span aria-hidden className="font-display text-base text-gold">
            {"//"}
          </span>
          Superteam × TxODDS · Prediction Markets &amp; Settlement
        </p>

        {/* ── the poster stack ─────────────────────────────────────────── */}
        <div className="relative mt-5">
          <h1
            className="poster-headline relative z-10"
            style={{
              color: "color-mix(in oklch, var(--foreground) 88%, var(--primary))",
            }}
          >
            <span className="sr-only">
              Bet on sports — and actually get paid.
            </span>
            <span aria-hidden>
              <span className="block">Bet on</span>
              <span className="block">Sports —</span>
              <span className="text-gradient-gold block">Get paid</span>
            </span>
          </h1>

          {/* the real product card, overlapping the type from the right.
              Pulled left on lg so its edge sits over the tail of "SPORTS —"; the
              left of each word stays readable, the card covers the right. */}
          <div className="relative z-20 mx-auto mt-10 w-full max-w-sm lg:absolute lg:top-1/2 lg:right-0 lg:mt-0 lg:-translate-x-[6rem] lg:-translate-y-1/2 xl:-translate-x-[9rem]">
            <HeroMarketCard />
          </div>
        </div>

        {/* ── z-30 · foreground UI ──────────────────────────────────────── */}
        <div className="relative z-30 mt-12 max-w-2xl lg:mt-14">
          <p className="body-l text-muted-foreground text-pretty">
            An AI places the bets. When the match ends, the official data pays
            the winners automatically — on-chain. No bookie decides who won, and
            no company can sit on your money.
          </p>

          <div className="mt-8 flex flex-col items-start gap-5">
            <TrustBadge className="rounded-none" />
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-none">
                <Link href="/settlement">
                  See a settlement
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-none"
              >
                <Link href="/agent">Watch the agent</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="rounded-none"
              >
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
        </div>

        <LiveDevnetStats className="relative z-30 mt-12" />
      </div>
    </section>
  );
}
