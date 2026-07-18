/**
 * Shared shapes for the Mongo read path — the single source of truth for the dataset
 * key and the query/response contracts. Every consumer (lib, routes, hooks) imports
 * from here; nothing redeclares them.
 */

/**
 * A capture dataset. The loader keys BOTH `fixtures` (compound `_id` = `dataset:fixtureId`,
 * unique index `dataset_fixtureId_unique`) and `odds_updates` (`meta.dataset`) by this, so a
 * fixture id alone is NOT unique — every query must carry a dataset.
 *
 * `worldcup_prematch` is the default because it is the capture the `/agent` replay and the
 * settlement demo are built on.
 */
export type Dataset = "worldcup_prematch" | "all_competitions";

export const DEFAULT_DATASET: Dataset = "worldcup_prematch";

const DATASETS: readonly string[] = ["worldcup_prematch", "all_competitions"];

/** Narrow untrusted query-string input to a known dataset, falling back to the default. */
export function parseDataset(raw: string | null | undefined): Dataset {
  return raw && DATASETS.includes(raw) ? (raw as Dataset) : DEFAULT_DATASET;
}

/** One real reading of one price line: capture timestamp (epoch ms) + implied prob (pp). */
export interface Reading {
  ts: number;
  pct: number;
}

/** A fixture's identity and result, as the capture recorded it. */
export interface FixtureMeta {
  fixtureId: number;
  dataset: Dataset;
  participant1: string;
  participant2: string;
  competition: string;
  competitionId: number;
  kickoffMs: number;
  bookmakers: string[];
  oddsUpdateCount: number;
  oddsFirstTs: number;
  oddsLastTs: number;
  /**
   * SETTLED means `labeled` — the capture carries a real, scored outcome.
   *
   * NOT `result.available`: 103 of 108 fixtures have `result.available = true` but only 57
   * are actually settled, because `available` merely says a score document existed — it can
   * hold a half-time or partial score with `outcome: null`. Filtering on `available` would
   * silently mix 46 unfinished matches into any "settled" set.
   */
  settled: boolean;
  outcome: string | null;
  participant1Goals: number | null;
  participant2Goals: number | null;
}

/** The downsampled, projected series the charts render. */
export interface SeriesResponse {
  kind: "downsampled";
  fixtureId: number;
  dataset: Dataset;
  market: string;
  outcome: string;
  /** Readings that matched BEFORE downsampling — so the UI can state what it is showing. */
  readingsMatched: number;
  points: Reading[];
}

/** One page of the raw, un-downsampled series, for callers that need every tick. */
export interface SeriesPageResponse {
  kind: "page";
  fixtureId: number;
  dataset: Dataset;
  market: string;
  outcome: string;
  limit: number;
  points: Reading[];
  /**
   * Pass back as `cursor` to get the next page: a `ts` value, NOT an offset.
   * `null` once the series is exhausted.
   */
  nextCursor: number | null;
}
