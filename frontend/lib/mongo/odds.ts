import type { Document } from "mongodb";

import { getDb } from "./client";
import {
  DEFAULT_DATASET,
  type Dataset,
  type Reading,
  type SeriesPageResponse,
  type SeriesResponse,
} from "./types";

/**
 * Reads over `odds_updates` — a 3.66M-document time-series collection.
 *
 * The load-bearing rule here is REDUCE IN THE DATABASE, NOT AFTER SHIPPING. A whole fixture's
 * series is 16,781 documents (~4.6s); shipping that to a browser to draw a 100-bar chart is
 * the wrong shape at every layer. So every read below:
 *
 *   1. filters to ONE market (an index-supported predicate, not a post-filter),
 *   2. projects away everything the chart does not draw — `prices[]`, `inRunning`, `meta`,
 *      the other outcomes' percentages — leaving `{ts, pct}` and nothing else,
 *   3. downsamples with `$bucketAuto` so the response is ~100 points regardless of how many
 *      readings the market actually holds.
 *
 * `odds_updates` is queried directly rather than the `odds_updates_flat` view because a view
 * is a prepended pipeline stage: predicates against it are matched AFTER the view's `$set`
 * stages, which can cost the index. Querying `meta.*` keeps the `(meta.fixtureId, ts)` index
 * in play. `tsMs` (the epoch-millis form the rest of the codebase uses) is derived in the
 * final `$project` instead — the same value, computed for ~100 documents rather than 16,781.
 */

const COLLECTION = "odds_updates";

/** Default chart resolution. ~100 points is more than a few hundred CSS pixels can resolve. */
export const DEFAULT_POINTS = 100;
const MAX_POINTS = 500;

/** Page size for the raw-tick path. Capped so one request can never pull a whole fixture. */
export const DEFAULT_PAGE_LIMIT = 500;
const MAX_PAGE_LIMIT = 2000;

export interface SeriesQuery {
  fixtureId: number;
  market: string;
  /** Key within the `pct` sub-document: `over`/`under`, or `part1`/`draw`/`part2`. */
  outcome: string;
  dataset?: Dataset;
  points?: number;
}

export interface SeriesPageQuery extends Omit<SeriesQuery, "points"> {
  /** Range cursor: return readings with `ts` strictly greater than this. */
  cursor?: number | null;
  limit?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/**
 * The `$match` every read starts from.
 *
 * Field order mirrors the `(meta.fixtureId, ts)` index so the fixture predicate bounds the
 * scan; `meta.market` and `meta.dataset` then narrow within it.
 */
function matchLine(fixtureId: number, market: string, dataset: Dataset): Document {
  return {
    "meta.fixtureId": fixtureId,
    "meta.market": market,
    "meta.dataset": dataset,
  };
}

/**
 * Drop to `{ts, pct}` as early as possible.
 *
 * `$pct.<outcome>` is looked up with `$getField` rather than string concatenation into a
 * dotted path: outcome names arrive from the query string, and `$getField` treats the name as
 * a literal key, so a crafted value cannot walk into another part of the document.
 */
function projectOutcome(outcome: string): Document[] {
  return [
    {
      $project: {
        _id: 0,
        ts: 1,
        pct: { $getField: { field: { $literal: outcome }, input: "$pct" } },
      },
    },
    // A market carries only its own outcomes; asking for one it does not have yields null.
    { $match: { pct: { $type: "number" } } },
  ];
}

/**
 * A downsampled, projected series for ONE market line — the default read for any chart.
 *
 * `$bucketAuto` splits the matched readings into ~`points` equal-population time buckets and
 * emits the LAST reading in each (`$top` sorted by descending `ts`), which is the correct
 * summary for a price line: the price that stood at the end of the interval. It is a real
 * captured reading, never an average of several, so no point on the chart is a number the
 * book never showed.
 */
export async function downsampledSeries(query: SeriesQuery): Promise<SeriesResponse> {
  const { fixtureId, market, outcome } = query;
  const dataset = query.dataset ?? DEFAULT_DATASET;
  const points = clamp(query.points ?? DEFAULT_POINTS, 2, MAX_POINTS);
  const db = await getDb();

  const pipeline: Document[] = [
    { $match: matchLine(fixtureId, market, dataset) },
    ...projectOutcome(outcome),
    {
      $bucketAuto: {
        groupBy: "$ts",
        buckets: points,
        output: {
          n: { $sum: 1 },
          ts: { $max: "$ts" },
          pct: { $top: { sortBy: { ts: -1 }, output: "$pct" } },
        },
      },
    },
    { $sort: { "_id.min": 1 } },
    // tsMs — epoch millis, the form the rest of the codebase uses — computed on ~100 docs.
    { $project: { _id: 0, ts: { $toLong: "$ts" }, pct: 1, n: 1 } },
  ];

  const buckets = await db
    .collection(COLLECTION)
    .aggregate<{ ts: number; pct: number; n: number }>(pipeline)
    .toArray();

  return {
    kind: "downsampled",
    fixtureId,
    dataset,
    market,
    outcome,
    readingsMatched: buckets.reduce((sum, b) => sum + b.n, 0),
    points: buckets.map(({ ts, pct }) => ({ ts: Number(ts), pct })),
  };
}

/**
 * One page of raw readings, for callers that genuinely need every tick.
 *
 * Paginated by RANGE on `ts` (`ts > cursor`, ascending), never `skip`/`limit`. `skip` walks
 * and discards every preceding document, so page latency grows linearly with depth — on a
 * 3.66M-document collection a deep page becomes unusable. A `ts` range predicate rides the
 * `(meta.fixtureId, ts)` index and stays flat at any depth: page 1 and page 30 cost the same.
 *
 * `nextCursor` is the last `ts` returned. Two readings can share a millisecond, so a page
 * boundary that lands between them would drop the second — the boundary is therefore pushed
 * past the whole millisecond and any readings equal to `nextCursor` are re-emitted at the head
 * of the next page rather than lost.
 */
export async function seriesPage(query: SeriesPageQuery): Promise<SeriesPageResponse> {
  const { fixtureId, market, outcome } = query;
  const dataset = query.dataset ?? DEFAULT_DATASET;
  const limit = clamp(query.limit ?? DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const db = await getDb();

  const match = matchLine(fixtureId, market, dataset);
  if (query.cursor != null && Number.isFinite(query.cursor)) {
    match.ts = { $gt: new Date(query.cursor) };
  }

  const rows = await db
    .collection(COLLECTION)
    .aggregate<{ ts: number; pct: number }>([
      { $match: match },
      { $sort: { ts: 1 } },
      ...projectOutcome(outcome),
      // +1 probe: tells us whether another page exists without a second round trip.
      { $limit: limit + 1 },
      { $project: { _id: 0, ts: { $toLong: "$ts" }, pct: 1 } },
    ])
    .toArray();

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(({ ts, pct }) => ({ ts: Number(ts), pct }));

  return {
    kind: "page",
    fixtureId,
    dataset,
    market,
    outcome,
    limit,
    points: page,
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].ts : null,
  };
}

/**
 * Every reading of one market line, in capture order — projected to `{ts, pct}`.
 *
 * Bounded by construction: this is used for the `/agent` replay window, where the line holds
 * a few hundred readings, and the caller slices a contiguous window out of it. The window
 * must be contiguous REAL readings (the chart claims every bar is one reading off the wire),
 * so this one path deliberately does not downsample.
 */
export async function lineSeries(
  fixtureId: number,
  market: string,
  outcome: string,
  dataset: Dataset = DEFAULT_DATASET,
): Promise<Reading[]> {
  const db = await getDb();
  const rows = await db
    .collection(COLLECTION)
    .aggregate<{ ts: number; pct: number }>([
      { $match: matchLine(fixtureId, market, dataset) },
      { $sort: { ts: 1 } },
      ...projectOutcome(outcome),
      { $project: { _id: 0, ts: { $toLong: "$ts" }, pct: 1 } },
    ])
    .toArray();
  return rows.map(({ ts, pct }) => ({ ts: Number(ts), pct: Math.round(pct * 1000) / 1000 }));
}
