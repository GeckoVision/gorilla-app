import { Connection } from "@solana/web3.js";

import { DATA_MODE, type DataMode, rpcEndpoint } from "./config";

let cached: { key: string; conn: Connection } | null = null;

/**
 * A `confirmed`-commitment connection pointed at the same-origin RPC proxy.
 * Memoised per mode so repeated reads reuse one client.
 */
export function getConnection(mode: DataMode = DATA_MODE): Connection {
  const endpoint = rpcEndpoint(mode);
  if (cached && cached.key === endpoint) return cached.conn;
  const conn = new Connection(endpoint, "confirmed");
  cached = { key: endpoint, conn };
  return conn;
}
