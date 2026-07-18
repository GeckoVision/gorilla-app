import { describe, expect, it } from "vitest";

import {
  REPLAY,
  fixtureLabel,
  lineLabel,
  moveIndex,
  movesOnThisLine,
  provenanceLabel,
} from "@/lib/agent/replay";
import { POLICY } from "@/lib/agent/policy";

// These assert the artifact is REAL and HONESTLY LABELLED — the two ways the /agent page
// could regress into fiction. They fail if someone hand-edits the JSON into a nicer story.
describe("agent replay artifact", () => {
  it("is labelled recorded, never live", () => {
    expect(REPLAY.provenance.kind).toBe("recorded-replay");
    expect(provenanceLabel().toLowerCase()).toContain("recorded replay");
    expect(provenanceLabel().toLowerCase()).not.toContain("live");
  });

  it("carries the real fixture identity so the data is auditable", () => {
    expect(REPLAY.fixture.id).toBeGreaterThan(0);
    expect(REPLAY.fixture.competition).toBe("World Cup");
    expect(fixtureLabel()).toMatch(/ v /);
    expect(REPLAY.fixture.kickoffMs).toBeGreaterThan(0);
  });

  it("ships a real, ordered, non-empty series with real timestamps", () => {
    expect(REPLAY.series.length).toBeGreaterThan(1);
    const timestamps = REPLAY.series.map((r) => r.ts);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    for (const reading of REPLAY.series) {
      expect(reading.ts).toBeGreaterThan(1_700_000_000_000);
      expect(reading.pct).toBeGreaterThan(0);
      expect(reading.pct).toBeLessThan(100);
    }
  });

  it("states the window it is a window OF, so nothing is implied about the rest", () => {
    expect(REPLAY.line.readingsOnLine).toBeGreaterThanOrEqual(REPLAY.series.length);
    expect(REPLAY.line.windowEnd - REPLAY.line.windowStart).toBe(REPLAY.series.length);
    expect(REPLAY.detector.readingsObserved).toBeGreaterThan(REPLAY.series.length);
  });

  it("shows a move the detector really flagged, on the line being charted", () => {
    const [move] = movesOnThisLine();
    expect(move).toBeDefined();
    expect(Math.abs(move.delta_pct)).toBeGreaterThanOrEqual(
      REPLAY.detector.thresholdPct,
    );
    expect(move.new_pct - move.old_pct).toBeCloseTo(move.delta_pct, 2);
    // the flagged reading is IN the charted window, so the chart and the signal agree
    expect(moveIndex()).toBeGreaterThanOrEqual(0);
    expect(REPLAY.series[moveIndex()].pct).toBeCloseTo(move.new_pct, 3);
  });

  it("renders the raw line id into a label without losing the parameters", () => {
    expect(lineLabel()).toContain(REPLAY.line.market.split("|")[1].replace("line=", ""));
  });
});

describe("agent policy artifact", () => {
  it("comes from the backend ChainPolicy, not the UI", () => {
    expect(POLICY.source).toContain("chain_policy");
    expect(POLICY.maxSpendSol).toBeGreaterThan(0);
    expect(POLICY.stakePerBetSol).toBeLessThanOrEqual(POLICY.maxPerFixtureSol);
    expect(POLICY.maxPerFixtureSol).toBeLessThanOrEqual(POLICY.maxSpendSol);
  });

  it("binds every allowed purpose to a real program + instruction", () => {
    expect(POLICY.allow.length).toBeGreaterThan(0);
    for (const binding of POLICY.allow) {
      expect(binding.programId).toHaveLength(44);
      expect(binding.instruction).toMatch(/^[a-z_]+$/);
    }
  });
});
