import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_PAGE_LIMIT, DEFAULT_POINTS, downsampledSeries, seriesPage } from "@/lib/mongo/odds";
import { errorResponse, intParam } from "@/lib/mongo/respond";
import { parseDataset } from "@/lib/mongo/types";

/**
 * One market line's captured odds, read from MongoDB server-side.
 *
 * `GET /api/data/odds?fixture=18257865&market=...&outcome=over`
 *   → ~100 downsampled points. The DEFAULT, and what every chart should use.
 *
 * `GET /api/data/odds?...&paginate=1&cursor=<ts>&limit=500`
 *   → raw ticks, range-paginated on `ts`. Opt-in, for callers that need every reading.
 *
 * The reduction happens inside the database (see `lib/mongo/odds.ts`), not after shipping:
 * a whole fixture is 16,781 documents, a market is up to 2,829, and what leaves here is a few
 * KB of `{ts, pct}`. This handler stays thin — parse, delegate, serialize.
 *
 * `MONGODB_URI` is read only on the server; nothing in the response echoes it.
 */

export const runtime = "nodejs";
// The capture is historical and immutable, but it is re-loadable — so no static caching.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const fixtureId = intParam(params.get("fixture"));
  const market = params.get("market");
  const outcome = params.get("outcome");

  if (!fixtureId || !market || !outcome) {
    return NextResponse.json(
      { error: "fixture (positive integer), market and outcome are required." },
      { status: 400 },
    );
  }

  const dataset = parseDataset(params.get("dataset"));

  try {
    if (params.get("paginate") === "1") {
      const cursorRaw = params.get("cursor");
      const cursor = cursorRaw !== null && cursorRaw !== "" ? Number(cursorRaw) : null;
      if (cursor !== null && !Number.isFinite(cursor)) {
        return NextResponse.json(
          { error: "cursor must be a timestamp in epoch milliseconds." },
          { status: 400 },
        );
      }
      const page = await seriesPage({
        fixtureId,
        market,
        outcome,
        dataset,
        cursor,
        limit: intParam(params.get("limit")) ?? DEFAULT_PAGE_LIMIT,
      });
      return NextResponse.json(page);
    }

    const series = await downsampledSeries({
      fixtureId,
      market,
      outcome,
      dataset,
      points: intParam(params.get("points")) ?? DEFAULT_POINTS,
    });
    return NextResponse.json(series);
  } catch (err) {
    return errorResponse(err);
  }
}
