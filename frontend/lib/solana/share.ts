import { PublicKey } from "@solana/web3.js";

import type { MarketAccount } from "./forge-client";

/**
 * The shareable-market-link logic, kept pure so every branch is unit-testable:
 * someone opens a market, sends the link, and each friend lands on THAT market
 * with the bet panel already pointing at it.
 *
 * URL shape: `<origin>/settlement?market=<base58 market address>`.
 */

/**
 * Validate a raw `?market=` query value. Returns the canonical base58 address,
 * or `null` for anything that is not a plausible account address — the caller
 * renders the honest "this link doesn't point to a market" state off `null`,
 * never a crash. (Whether the address is a real Market owned by the forge
 * program is the on-chain half, checked by `fetchMarket`.)
 */
export function parseMarketParam(raw: string | null): string | null {
  if (!raw) return null;
  try {
    // PublicKey rejects non-base58 input and anything that isn't exactly 32 bytes.
    return new PublicKey(raw.trim()).toBase58();
  } catch {
    return null;
  }
}

/** The link the Share button copies. */
export function marketShareUrl(origin: string, address: string): string {
  return `${origin.replace(/\/$/, "")}/settlement?market=${address}`;
}

/**
 * The tab set to render: the featured markets, plus the linked market as an
 * extra tab — unless it already IS one of the featured tabs (no duplicates;
 * selection then lands on the existing tab).
 */
export function mergeLinkedMarket(
  featured: MarketAccount[],
  linked: MarketAccount | null,
): MarketAccount[] {
  if (!linked) return featured;
  if (featured.some((m) => m.address === linked.address)) return featured;
  return [...featured, linked];
}

/**
 * Which market the bet panel targets. An EXPLICIT selection (the visitor picked
 * a tab, or arrived via a shared link) is always honoured — a settled market's
 * fail-closed refusal is a real thing to show, never silently swapped away.
 * Only the page's own default selection gets routed to a market that can
 * actually accept a stake.
 */
export function resolveBetMarket(
  tabs: MarketAccount[],
  selected: string | null,
  explicit: boolean,
): MarketAccount | null {
  const selectedMarket = tabs.find((m) => m.address === selected) ?? null;
  if (explicit && selectedMarket) return selectedMarket;
  return tabs.find((m) => m.state !== "Settled") ?? selectedMarket;
}
