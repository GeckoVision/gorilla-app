import { cn } from "@/lib/utils";

/** A Merkle-node glyph: a root node fed by two leaves — the settlement thesis as a mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-7", className)}
      aria-hidden
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="url(#lg-fill)"
        stroke="oklch(0.83 0.185 156 / 0.5)"
        strokeWidth="1"
      />
      <path
        d="M16 7 L16 13 M16 13 L10 19 M16 13 L22 19"
        stroke="oklch(0.83 0.185 156)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="16" cy="7" r="2.4" fill="oklch(0.83 0.185 156)" />
      <circle cx="10" cy="20" r="2.4" fill="oklch(0.64 0.2 285)" />
      <circle cx="22" cy="20" r="2.4" fill="oklch(0.64 0.2 285)" />
      <circle cx="16" cy="13" r="1.6" fill="oklch(0.97 0.005 250)" />
      <defs>
        <linearGradient id="lg-fill" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="oklch(0.22 0.02 264)" />
          <stop offset="1" stopColor="oklch(0.17 0.016 264)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Logo />
      <span className="text-[15px] font-semibold tracking-tight">
        AgentForge
        <span className="text-muted-foreground"> Markets</span>
      </span>
    </span>
  );
}
