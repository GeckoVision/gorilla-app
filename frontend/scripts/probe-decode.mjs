// Standalone probe: fetch + decode the two featured markets from devnet,
// validating the exact byte offsets used by lib/solana/forge-client.ts.
import { Connection, PublicKey } from "@solana/web3.js";

const RPC = process.env.PROBE_RPC || "https://api.devnet.solana.com";
const PROGRAM = "7Pvo6SEh1zBa1Euvj5QQ4td9GpfsQosTpxhqwWtWUFt6";
const MARKETS = [
  "3urJkTFSAf6QXLU6QvkbbS4GjLn3Tos8VQjKgGmRrVL8",
  "CBmdQH4sATjCkeVUe8TC6fCmawv8rqf8sM5G39DHf295",
];

function decodeMarket(addr, data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const fixtureId = dv.getBigInt64(o, true); o += 8;
  const statKey = dv.getUint32(o, true); o += 4;
  const threshold = dv.getInt32(o, true); o += 4;
  const comparison = dv.getUint8(o); o += 1;
  const vault = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  const stakeYes = dv.getBigUint64(o, true); o += 8;
  const stakeNo = dv.getBigUint64(o, true); o += 8;
  const state = dv.getUint8(o) === 0 ? "Open" : "Settled"; o += 1;
  const winner = dv.getUint8(o) === 0 ? "Yes" : "No"; o += 1;
  const authority = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  return { addr, len: data.length, fixtureId: fixtureId.toString(), statKey, threshold, comparison, vault, stakeYes: stakeYes.toString(), stakeNo: stakeNo.toString(), state, winner, authority };
}

const conn = new Connection(RPC, "confirmed");
for (const m of MARKETS) {
  const info = await conn.getAccountInfo(new PublicKey(m));
  if (!info) { console.log(m, "=> NOT FOUND"); continue; }
  console.log(JSON.stringify(decodeMarket(m, info.data), null, 2));
}

// bonus: program-account scan by dataSize
try {
  const all = await conn.getProgramAccounts(new PublicKey(PROGRAM), { filters: [{ dataSize: 142 }] });
  console.log("getProgramAccounts(dataSize=142) markets:", all.length);
} catch (e) {
  console.log("getProgramAccounts failed:", e.message);
}
