import { Buffer } from "buffer";

// Real devnet account bytes (captured from the deployed forge_markets program)
// used as deterministic decode-regression fixtures.

export const MARKET_ADDRESS = "3urJkTFSAf6QXLU6QvkbbS4GjLn3Tos8VQjKgGmRrVL8";
export const MARKET_B64 =
  "277VNwDjxprfZRUBAAAAAAEAAAAAAAAAAFLWgKIpR9d/lGf8SCtpr3SXFRwjrjh0DiO6roV+YGTxgJaYAAAAAABAS0wAAAAAAAEAJ+9zUqFoGtpqIrUiwGeZIWZLl5jA9RQNccFpXt1LEvz//wEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
export const MARKET_DATA = new Uint8Array(Buffer.from(MARKET_B64, "base64"));

export const MARKET_EXPECTED = {
  fixtureId: 18179551n,
  statKey: 1,
  threshold: 0,
  comparison: 0, // GreaterThan
  vault: "6aN92DThkYoyWNFt3a7keE6AHWxbAFvf1bd5WjWtJEPi",
  stakeYes: 10_000_000n,
  stakeNo: 5_000_000n,
  state: "Settled",
  winner: "Yes",
  authority: "3gtfwhBtFKB4k9M7vjcZ9qCAW6HwP4Y2WLJiJbimBbrj",
  potLamports: 15_000_000n,
};

export const POSITION_ADDRESS = "2WxVEqJwjWKuzQg1tNapJ32MxxrgHDFAgSt5yxTkJucq";
export const POSITION_B64 =
  "qryP5HpA99ArQVOQO/Kv+WGPbGO11G+O0gfqN09vJetWY3CTXSGgLd/WmixIgy+rI7rzaJLqAC9IsrYD52j/rQBA9eMhfbNcAUBLTAAAAAAAAP8AAAAAAAAAAAAAAAAAAAAA";
export const POSITION_DATA = new Uint8Array(Buffer.from(POSITION_B64, "base64"));

export const POSITION_EXPECTED = {
  market: "3urJkTFSAf6QXLU6QvkbbS4GjLn3Tos8VQjKgGmRrVL8",
  owner: "G4miHrpWdyZwB5WJSDQVyeb1Q7XGA2FPFBAKmCaEWYro",
  side: "No",
  amount: 5_000_000n,
  claimed: false,
};
