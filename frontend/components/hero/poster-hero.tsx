/**
 * Monolog-style hero — ONE minimal, static composition. Not a UI panel: a
 * giant bottom-anchored AGENTFORGE wordmark (the hero element) under two short,
 * centered lines of copy, over a dark, moody, grainy atmosphere. No eyebrow,
 * no card, no CTA row, no stats bar — those all live in the proof section
 * directly below. Everything here is decorative + STATIC (reduced-motion-safe).
 *
 * The z-sandwich, back to front:
 *   -z-10  atmosphere — subtle purple/gold wash + fog + copy scrim + vignette + grain
 *   z-10   the giant wordmark (bottom-anchored, feet dissolving into the grain)
 *   z-20   the copy (small, centered, legible over everything)
 */
export function PosterHero() {
  return (
    <section className="relative isolate flex min-h-[84svh] flex-col overflow-hidden border-b border-border/60">
      {/* ── atmosphere — dark, calm, Monolog-quiet (no column rules, no cards) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* subtle, cinematic purple/gold wash */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 20%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 70%), radial-gradient(64% 62% at 82% 112%, color-mix(in oklch, var(--gold) 16%, transparent), transparent 72%), linear-gradient(180deg, color-mix(in oklch, var(--primary) 14%, transparent) 0%, transparent 46%)",
          }}
        />
        <div className="hero-fog absolute inset-0" />
        {/* soft center scrim → seats the copy so it stays legible over the
            wordmark crown + grain */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(46% 32% at 50% 40%, color-mix(in oklch, black 46%, transparent), transparent 72%)",
          }}
        />
        <div className="hero-vignette absolute inset-0" />
        <div className="poster-grain poster-grain-strong absolute inset-0" />
      </div>

      {/* ── copy — understated, centered, in the space above the wordmark ── */}
      <div className="relative z-20 flex flex-1 items-center justify-center px-4 pt-16 sm:px-6">
        <div className="mx-auto max-w-xl text-center [text-shadow:0_1px_22px_rgba(0,0,0,0.5)]">
          <h1 className="text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
            You won the bet. Getting paid shouldn&apos;t be the hard part.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            AgentForge settles it on-chain — the match data pays the winners
            automatically. No bookie, no excuses.
          </p>
        </div>
      </div>

      {/* ── the hero element — giant AGENTFORGE, bottom-anchored, feet bleeding
             off the bottom / dissolving into grain. Decorative (the brand is
             already the nav wordmark + the copy's H1); centered, its own
             overflow-hidden keeps any side-bleed from ever widening the page. ── */}
      <div
        aria-hidden
        className="relative z-10 flex w-full justify-center overflow-hidden"
      >
        <span className="hero-wordmark block translate-y-[12%] select-none">
          AgentForge
        </span>
      </div>
    </section>
  );
}
