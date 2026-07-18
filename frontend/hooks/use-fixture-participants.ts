"use client";

import { useEffect, useState } from "react";

import { DEMO_DATASET } from "@/lib/mongo/types";
import type { FixtureParticipants } from "@/lib/solana/predicate";

/**
 * Resolve `fixtureId → (participant1, participant2)` from the SAME capture the rest of the
 * page reads (`/api/data/fixtures`), so the settlement UI can say "France vs England" instead
 * of "Fixture 18257865".
 *
 * A `Market` account on chain carries only its `fixtureId` — the names live in the fixtures
 * capture. This reads the whole (small: ~100 fixtures) list ONCE and hands back a lookup. When
 * a fixture is not in the capture, the lookup returns `null` and every caller falls back to
 * showing the id honestly; names are never invented.
 */

export type ParticipantsLookup = (
  fixtureId: bigint | number,
) => FixtureParticipants | null;

interface FixtureRow {
  fixtureId: number;
  participant1?: string;
  participant2?: string;
}

interface FixturesResponse {
  fixtures?: FixtureRow[];
}

export function useFixtureParticipants(): {
  lookup: ParticipantsLookup;
  loading: boolean;
} {
  const [byId, setById] = useState<Map<number, FixtureParticipants> | null>(null);

  useEffect(() => {
    let alive = true;
    // `limit` covers the whole capture (~100 fixtures); `dataset` is the app pin.
    fetch(`/api/data/fixtures?dataset=${DEMO_DATASET}&limit=500`)
      .then((res) => (res.ok ? (res.json() as Promise<FixturesResponse>) : null))
      .then((data) => {
        if (!alive) return;
        const map = new Map<number, FixtureParticipants>();
        for (const row of data?.fixtures ?? []) {
          const p1 = (row.participant1 ?? "").trim();
          const p2 = (row.participant2 ?? "").trim();
          // Only index a fixture we can actually name on BOTH sides — a half-known
          // fixture would render "France vs " which is worse than the id.
          if (p1 && p2) {
            map.set(row.fixtureId, { participant1: p1, participant2: p2 });
          }
        }
        setById(map);
      })
      .catch(() => alive && setById(new Map()));
    return () => {
      alive = false;
    };
  }, []);

  const lookup: ParticipantsLookup = (fixtureId) => {
    if (!byId) return null;
    return byId.get(Number(fixtureId)) ?? null;
  };

  return { lookup, loading: byId === null };
}
