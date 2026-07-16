// Dump real devnet account bytes as base64 for use as deterministic test fixtures.
import { Connection, PublicKey } from "@solana/web3.js";

const RPC = process.env.PROBE_RPC || "https://api.devnet.solana.com";
const PROGRAM = new PublicKey("7Pvo6SEh1zBa1Euvj5QQ4td9GpfsQosTpxhqwWtWUFt6");
const MARKET = "3urJkTFSAf6QXLU6QvkbbS4GjLn3Tos8VQjKgGmRrVL8";

const conn = new Connection(RPC, "confirmed");

const m = await conn.getAccountInfo(new PublicKey(MARKET));
console.log("MARKET_B64:", Buffer.from(m.data).toString("base64"));
console.log("MARKET_LEN:", m.data.length);

const positions = await conn.getProgramAccounts(PROGRAM, {
  filters: [{ dataSize: 99 }, { memcmp: { offset: 8, bytes: MARKET } }],
});
if (positions.length) {
  const p = positions[0];
  console.log("POSITION_ADDR:", p.pubkey.toBase58());
  console.log("POSITION_B64:", Buffer.from(p.account.data).toString("base64"));
  console.log("POSITION_LEN:", p.account.data.length);
} else {
  console.log("no positions found for market");
}
