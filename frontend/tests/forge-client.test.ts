import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import {
  buildStakeIx,
  Comparison,
  customErrorCode,
  decodeMarket,
  decodePosition,
  DISCRIMINATORS,
  lamportsToSol,
  marketPda,
  positionPda,
  settlementErrorName,
  toLamports,
  vaultPda,
} from "@/lib/solana/forge-client";
import { FORGE_PROGRAM_ID } from "@/lib/solana/config";
import {
  MARKET_ADDRESS,
  MARKET_DATA,
  MARKET_EXPECTED,
  POSITION_ADDRESS,
  POSITION_DATA,
  POSITION_EXPECTED,
} from "./fixtures";

const STAKER = new PublicKey("G4miHrpWdyZwB5WJSDQVyeb1Q7XGA2FPFBAKmCaEWYro");

describe("decodeMarket — real devnet bytes", () => {
  const m = decodeMarket(MARKET_ADDRESS, MARKET_DATA);

  it("decodes every field byte-exactly", () => {
    expect(m.fixtureId).toBe(MARKET_EXPECTED.fixtureId);
    expect(m.statKey).toBe(MARKET_EXPECTED.statKey);
    expect(m.predicate.threshold).toBe(MARKET_EXPECTED.threshold);
    expect(m.predicate.comparison).toBe(Comparison.GreaterThan);
    expect(m.vault).toBe(MARKET_EXPECTED.vault);
    expect(m.stakeYes).toBe(MARKET_EXPECTED.stakeYes);
    expect(m.stakeNo).toBe(MARKET_EXPECTED.stakeNo);
    expect(m.state).toBe(MARKET_EXPECTED.state);
    expect(m.winner).toBe(MARKET_EXPECTED.winner);
    expect(m.authority).toBe(MARKET_EXPECTED.authority);
    expect(m.potLamports).toBe(MARKET_EXPECTED.potLamports);
  });

  it("throws on a truncated buffer (malformed account)", () => {
    expect(() => decodeMarket(MARKET_ADDRESS, MARKET_DATA.subarray(0, 40))).toThrow();
  });

  it("the stored vault matches the derived vault PDA", () => {
    const [vault] = vaultPda(new PublicKey(MARKET_ADDRESS));
    expect(vault.toBase58()).toBe(m.vault);
  });
});

describe("decodePosition — real devnet bytes", () => {
  const p = decodePosition(POSITION_ADDRESS, POSITION_DATA);

  it("decodes every field byte-exactly", () => {
    expect(p.market).toBe(POSITION_EXPECTED.market);
    expect(p.owner).toBe(POSITION_EXPECTED.owner);
    expect(p.side).toBe(POSITION_EXPECTED.side);
    expect(p.amount).toBe(POSITION_EXPECTED.amount);
    expect(p.claimed).toBe(POSITION_EXPECTED.claimed);
  });

  it("throws on a truncated buffer", () => {
    expect(() => decodePosition(POSITION_ADDRESS, POSITION_DATA.subarray(0, 20))).toThrow();
  });
});

describe("buildStakeIx — first-call-correct wire format", () => {
  const { instruction, market, position, vault } = buildStakeIx({
    fixtureId: MARKET_EXPECTED.fixtureId,
    statKey: MARKET_EXPECTED.statKey,
    staker: STAKER,
    side: "Yes",
    amountLamports: 5_000_000n,
  });
  const data = Uint8Array.from(instruction.data);

  it("targets the forge program", () => {
    expect(instruction.programId.equals(FORGE_PROGRAM_ID)).toBe(true);
  });

  it("starts with the exact `stake` discriminator", () => {
    expect(Array.from(data.subarray(0, 8))).toEqual(DISCRIMINATORS.stake);
  });

  it("encodes side (u8) then amount (u64 LE)", () => {
    expect(data[8]).toBe(0); // Yes = 0
    const amount = new DataView(data.buffer, data.byteOffset).getBigUint64(9, true);
    expect(amount).toBe(5_000_000n);
    expect(data.length).toBe(8 + 1 + 8);
  });

  it("has the correct account order + signer/writable flags", () => {
    const keys = instruction.keys;
    expect(keys).toHaveLength(5);
    // market (w), position (w), vault (w), staker (signer,w), system (r)
    expect(keys[0].pubkey.equals(market)).toBe(true);
    expect(keys[0].isWritable && !keys[0].isSigner).toBe(true);
    expect(keys[1].pubkey.equals(position)).toBe(true);
    expect(keys[1].isWritable && !keys[1].isSigner).toBe(true);
    expect(keys[2].pubkey.equals(vault)).toBe(true);
    expect(keys[2].isWritable && !keys[2].isSigner).toBe(true);
    expect(keys[3].pubkey.equals(STAKER)).toBe(true);
    expect(keys[3].isSigner && keys[3].isWritable).toBe(true);
    expect(keys[4].isSigner).toBe(false);
    expect(keys[4].isWritable).toBe(false);
  });

  it("derives the same market PDA as the real on-chain account", () => {
    const [pda] = marketPda(MARKET_EXPECTED.fixtureId, MARKET_EXPECTED.statKey);
    expect(pda.toBase58()).toBe(MARKET_ADDRESS);
    expect(market.toBase58()).toBe(MARKET_ADDRESS);
  });

  it("encodes NO as side = 1", () => {
    const { instruction: noIx } = buildStakeIx({
      fixtureId: MARKET_EXPECTED.fixtureId,
      statKey: MARKET_EXPECTED.statKey,
      staker: STAKER,
      side: "No",
      amountLamports: 1n,
    });
    expect(Uint8Array.from(noIx.data)[8]).toBe(1);
  });

  it("rejects a non-positive stake", () => {
    expect(() =>
      buildStakeIx({
        fixtureId: 1n,
        statKey: 1,
        staker: STAKER,
        side: "Yes",
        amountLamports: 0n,
      }),
    ).toThrow();
  });
});

describe("PDA derivation is deterministic", () => {
  it("marketPda / vaultPda / positionPda are stable for the same inputs", () => {
    const [m1] = marketPda(42n, 7);
    const [m2] = marketPda(42n, 7);
    expect(m1.toBase58()).toBe(m2.toBase58());
    const [v1] = vaultPda(m1);
    const [v2] = vaultPda(m2);
    expect(v1.toBase58()).toBe(v2.toBase58());
    const [p1] = positionPda(m1, STAKER);
    const [p2] = positionPda(m2, STAKER);
    expect(p1.toBase58()).toBe(p2.toBase58());
  });
});

describe("value + error helpers", () => {
  it("toLamports / lamportsToSol round-trip", () => {
    expect(toLamports(0.01)).toBe(10_000_000n);
    expect(toLamports(1)).toBe(1_000_000_000n);
    expect(lamportsToSol(15_000_000n)).toBeCloseTo(0.015);
  });

  it("settlementErrorName maps known codes and returns null otherwise", () => {
    expect(settlementErrorName(6000)).toBe("MarketNotOpen");
    expect(settlementErrorName(6010)).toBe("OracleBadReturnData");
    expect(settlementErrorName(9999)).toBeNull();
  });

  it("customErrorCode extracts an Anchor Custom code", () => {
    expect(customErrorCode({ InstructionError: [0, { Custom: 6000 }] })).toBe(6000);
    expect(customErrorCode({ InstructionError: [0, "BorshIoError"] })).toBeNull();
    expect(customErrorCode("some string error")).toBeNull();
    expect(customErrorCode(null)).toBeNull();
  });
});
