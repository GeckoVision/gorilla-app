/**
 * The agent's reasoning scenario, as visualised on the Agent dashboard.
 *
 * The numbers mirror the offline agent core: a `SharpDetector` (3% implied-move
 * threshold) watching an odds replay, feeding a `decide()` that backs the sharp
 * direction, sized within a risk policy — then a custody policy the wallet
 * enforces before it will sign. It resolves to the real on-chain market
 * (fixture 18179551, stat #1 > 0) featured on the Settlement view.
 */

export interface OddsTick {
  seq: number;
  /** Implied probability of the YES outcome, in %. */
  impliedPct: number;
}

export const FIXTURE = {
  id: 18179551,
  statKey: 1,
  competition: "World Cup",
  label: "Fixture 18179551",
  statLabel: "Stat #1 (goals) > 0",
  question: "Will there be at least one goal?",
  dataSource: "TxLINE",
} as const;

// Implied P(at least one goal) — flat, then a sharp repricing at seq 3.
export const ODDS_SERIES: OddsTick[] = [
  { seq: 0, impliedPct: 51.5 },
  { seq: 1, impliedPct: 52.2 },
  { seq: 2, impliedPct: 51.9 },
  { seq: 3, impliedPct: 57.6 },
  { seq: 4, impliedPct: 58.1 },
  { seq: 5, impliedPct: 57.8 },
  { seq: 6, impliedPct: 58.4 },
];

export const SHARP_MOVE = {
  atSeq: 3,
  fromPct: 51.9,
  toPct: 57.6,
  deltaPct: 5.7,
  thresholdPct: 3.0,
  direction: "up" as const,
  side: "Yes" as const,
};

export const RISK_POLICY = {
  maxStakeSol: 0.01,
  maxPerFixtureSol: 0.01,
};

/** The custody policy the signing wallet enforces — belt (client risk cap) plus
 * braces (this allow-list + spend cap, enforced before a signature exists). */
export const CUSTODY_POLICY = {
  maxSpendSol: 0.01,
  allow: [
    { program: "forge_markets", instruction: "stake" },
    { program: "forge_markets", instruction: "settle" },
    { program: "forge_markets", instruction: "claim" },
  ],
};

export const BET = {
  side: "Yes" as const,
  amountSol: 0.01,
  rationale:
    "implied P(goal) repriced +5.7% (> 3.0% threshold) — back the sharp money",
};

export interface RefusalDemo {
  id: string;
  title: string;
  attempt: string;
  reason: string;
  code: string;
}

// The two "the agent physically can't" beats — refused BEFORE any signature.
export const REFUSALS: RefusalDemo[] = [
  {
    id: "over-cap",
    title: "Over-cap bet",
    attempt: "stake 0.05 SOL on forge_markets",
    reason: "0.05 SOL exceeds the 0.01 SOL max-spend cap",
    code: "policy_violation",
  },
  {
    id: "off-allowlist",
    title: "Off-allowlist call",
    attempt: "systemProgram.transfer → drain the wallet",
    reason: "target program/instruction is not on the allow-list",
    code: "policy_violation",
  },
];
