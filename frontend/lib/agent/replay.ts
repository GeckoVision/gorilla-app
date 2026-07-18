/**
 * The agent's odds input: a RECORDED REPLAY of real captured TxLINE wire records, replayed
 * through the real `SharpDetector`.
 *
 * The prices are read from MongoDB per request (`lib/mongo/replay.ts`) — the capture itself is
 * gigabytes and lives outside the repo, and a checked-in export of it could never reach a
 * deployment. The detector's verdict rides along as a small artifact (`lib/agent/manifest.ts`).
 * Nothing here is synthesized: every `pct` and every `ts` came off the live TxODDS API during
 * the capture window, and every move was flagged by the real detector at the real threshold.
 *
 * It is RECORDED, not live — reading it from a database does not change that. Anything that
 * renders this data must say so; see {@link provenanceLabel}.
 *
 * This module is shared by server and client, so it stays pure types + formatting: no `mongodb`
 * import may reach it, or the driver would be pulled into the browser bundle.
 */

export interface Reading {
  /** Capture timestamp, ms since epoch — the real moment the book moved. */
  ts: number;
  /** Implied probability of the outcome, in percentage points. */
  pct: number;
}

export interface DetectedMove {
  ts: number;
  bookmaker: string;
  market: string;
  outcome: string;
  old_pct: number;
  new_pct: number;
  delta_pct: number;
  direction: "up" | "down";
}

export interface ReplaySlice {
  provenance: {
    kind: "recorded-replay";
    source: string;
    note: string;
    captureFromMs: number;
    captureToMs: number;
    generatedAt: string;
    /** Where the prices were read from — `"mongodb"` for every served slice. */
    store: string;
    /** Which capture dataset the readings came from. */
    dataset: string;
  };
  fixture: {
    id: number;
    participant1: string;
    participant2: string;
    competition: string;
    competitionId: number;
    kickoffMs: number;
  };
  detector: {
    thresholdPct: number;
    readingsObserved: number;
    movesFlagged: number;
  };
  line: {
    bookmaker: string;
    market: string;
    outcome: string;
    readingsOnLine: number;
    windowStart: number;
    windowEnd: number;
  };
  series: Reading[];
  moves: DetectedMove[];
}

export function fixtureLabel(slice: ReplaySlice): string {
  return `${slice.fixture.participant1} v ${slice.fixture.participant2}`;
}

/** A human market label — the raw TxLINE line id is exported verbatim so it stays auditable. */
export function lineLabel(slice: ReplaySlice): string {
  const [market, params] = slice.line.market.split("|");
  const pretty = market
    .toLowerCase()
    .replace(/_/g, " ")
    .replace("overunder participant goals", "over/under goals");
  return params ? `${pretty} (${params.replace("line=", "")})` : pretty;
}

export function formatCaptureDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCaptureTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19) + "Z";
}

/** The provenance line every view of this data must show. */
export function provenanceLabel(slice: ReplaySlice): string {
  return `Recorded replay · real ${slice.provenance.source} capture · ${fixtureLabel(slice)} · ${formatCaptureDate(slice.provenance.captureFromMs)}`;
}

/** The index in `series` the flagged move landed on, or -1 when it falls outside the window. */
export function moveIndex(slice: ReplaySlice): number {
  const move = slice.moves[0];
  if (!move) return -1;
  return slice.series.findIndex((r) => r.ts === move.ts);
}

/** The move the exported series actually shows (same book, same line), if any. */
export function movesOnThisLine(slice: ReplaySlice): DetectedMove[] {
  return slice.moves.filter(
    (m) => m.market === slice.line.market && m.outcome === slice.line.outcome,
  );
}
