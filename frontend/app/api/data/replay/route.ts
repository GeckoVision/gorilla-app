import { NextRequest, NextResponse } from "next/server";

import { buildReplaySlice } from "@/lib/mongo/replay";
import { errorResponse } from "@/lib/mongo/respond";
import { parseDataset } from "@/lib/mongo/types";

/**
 * The `/agent` page's odds input, composed server-side.
 *
 * `GET /api/data/replay?dataset=worldcup_prematch`
 *
 * The prices come from MongoDB at request time; the detector's verdict comes from the real
 * Python detector's artifact (see `lib/mongo/replay.ts` for why that split is the honest one).
 *
 * This is a RECORDED REPLAY. The response carries `provenance.kind = "recorded-replay"` plus
 * the capture's real timestamps, and the UI is required to say so. Serving it out of a
 * database does not make it live and it must never be labelled live.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const slice = await buildReplaySlice({
      dataset: parseDataset(req.nextUrl.searchParams.get("dataset")),
    });
    return NextResponse.json(slice);
  } catch (err) {
    return errorResponse(err);
  }
}
