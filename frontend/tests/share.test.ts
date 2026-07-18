import { describe, expect, it } from "vitest";

import {
  marketShareUrl,
  mergeLinkedMarket,
  parseMarketParam,
  resolveBetMarket,
} from "@/lib/solana/share";
import type { MarketAccount, MarketStateName } from "@/lib/solana/forge-client";
import { MARKET_ADDRESS } from "./fixtures";

const market = (
  address: string,
  state: MarketStateName = "Open",
  fixtureId = 1n,
) => ({ address, fixtureId, statKey: 1, state, potLamports: 0n }) as MarketAccount;

describe("parseMarketParam", () => {
  it("accepts a valid base58 market address", () => {
    expect(parseMarketParam(MARKET_ADDRESS)).toBe(MARKET_ADDRESS);
  });

  it("trims surrounding whitespace (a pasted link survives)", () => {
    expect(parseMarketParam(`  ${MARKET_ADDRESS} `)).toBe(MARKET_ADDRESS);
  });

  it("rejects garbage with the error state value, never a throw", () => {
    // Each of these must land on `null` — the caller renders the honest
    // "this link doesn't point to a market" message off that value.
    expect(parseMarketParam(null)).toBeNull();
    expect(parseMarketParam("")).toBeNull();
    expect(parseMarketParam("not-a-market")).toBeNull();
    expect(parseMarketParam("abc")).toBeNull(); // valid base58, wrong byte length
    expect(parseMarketParam("O0Il")).toBeNull(); // not base58 at all
    expect(parseMarketParam(`${MARKET_ADDRESS}extra`)).toBeNull();
  });
});

describe("marketShareUrl", () => {
  it("builds <origin>/settlement?market=<address>", () => {
    expect(marketShareUrl("https://gorilla.example", MARKET_ADDRESS)).toBe(
      `https://gorilla.example/settlement?market=${MARKET_ADDRESS}`,
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(marketShareUrl("https://gorilla.example/", MARKET_ADDRESS)).toBe(
      `https://gorilla.example/settlement?market=${MARKET_ADDRESS}`,
    );
  });
});

describe("mergeLinkedMarket", () => {
  const featured = [market("s", "Settled"), market("a"), market("b")];

  it("appends the linked market as a fourth tab when it is not featured", () => {
    const linked = market("linked");
    const tabs = mergeLinkedMarket(featured, linked);
    expect(tabs.map((m) => m.address)).toEqual(["s", "a", "b", "linked"]);
  });

  it("does NOT duplicate a linked market that is already featured", () => {
    const tabs = mergeLinkedMarket(featured, market("a"));
    expect(tabs.map((m) => m.address)).toEqual(["s", "a", "b"]);
  });

  it("returns featured untouched when there is no linked market", () => {
    expect(mergeLinkedMarket(featured, null)).toEqual(featured);
  });
});

describe("resolveBetMarket", () => {
  const settled = market("settled", "Settled");
  const open = market("open");
  const linkedSettled = market("linked-settled", "Settled");
  const linkedOpen = market("linked-open");

  it("targets an explicitly selected open market (the shared link's market)", () => {
    const tabs = [settled, open, linkedOpen];
    expect(resolveBetMarket(tabs, "linked-open", true)?.address).toBe("linked-open");
  });

  it("a settled linked market stays the target — fail-closed explainer, no silent swap", () => {
    const tabs = [settled, open, linkedSettled];
    expect(resolveBetMarket(tabs, "linked-settled", true)?.address).toBe(
      "linked-settled",
    );
  });

  it("without an explicit pick, a settled default routes the panel to the open market", () => {
    const tabs = [settled, open];
    expect(resolveBetMarket(tabs, "settled", false)?.address).toBe("open");
  });

  it("falls back to the selected market when nothing is open, and to null when nothing exists", () => {
    expect(resolveBetMarket([settled], "settled", false)?.address).toBe("settled");
    expect(resolveBetMarket([], null, false)).toBeNull();
  });
});
